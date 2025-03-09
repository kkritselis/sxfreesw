let map;
let markers = {};
let activePopup = null;
let dayFilters = {}; // Store active state of day filters
// let tagFilters = {}; // Store active state of tag filters
let favoritesFilterActive = false; // Track if favorites filter is active
let allEvents = []; // Store all events for filtering

async function loadData() {
    const response = await fetch('data.tsv');
    const text = await response.text();
    const rows = text.split('\n')
        .filter(row => row.trim())
        .slice(1); // Skip header
    
    return rows.map(row => {
        const [name, date, timeRange, lat, lon, loc, tags, rsvp, img, desc, uid] = row.split('\t').map(field => field.trim());
        
        // Parse the date and time range
        const [startTime, endTime] = timeRange.split(' - ');
        
        // Create full datetime strings by combining date and times
        const startDateTime = new Date(`${date} ${startTime}`);
        const endDateTime = new Date(`${date} ${endTime}`);
        
        // For events that span past midnight
        if (endDateTime < startDateTime) {
            endDateTime.setDate(endDateTime.getDate() + 1);
        }

        // Use the UID from the TSV if available, otherwise create a unique ID
        const uniqueId = uid || `${name}_${date}`;

        // Create the event object
        const event = {
            name,
            date,
            uniqueId, // Add the unique ID to the event object
            start: startDateTime,
            end: endDateTime,
            img: img || 'default.png',
            desc,
            loc,
            rsvp,
            tags: tags ? tags.split(',').map(t => t.trim()) : []
        };

        // Only add coordinates if they exist and are valid
        if (lat && lon && lat !== 'TBD' && lon !== 'TBD') {
            event.lat = parseFloat(lat);
            event.lon = parseFloat(lon);
        }

        return event;
    }).filter(event => event !== null);
}

// Initialize day filters
function initDayFilters(events) {
    // Get unique dates from events
    const uniqueDates = [...new Set(events.map(event => event.date))];
    
    // Sort dates chronologically
    uniqueDates.sort((a, b) => new Date(a) - new Date(b));
    
    // Load saved filter states from localStorage
    let savedFilters = {};
    try {
        const saved = localStorage.getItem('dayFilters');
        if (saved) {
            savedFilters = JSON.parse(saved);
        }
    } catch (e) {
        console.error('Error loading saved day filters:', e);
    }
    
    // Create filter buttons
    const filterContainer = document.getElementById('day-filters');
    
    // Clear any existing filters first
    filterContainer.innerHTML = '';
    
    uniqueDates.forEach(date => {
        // Create button
        const button = document.createElement('div');
        button.className = 'day-filter';
        
        // Format date for display (e.g., "Wed Mar 6")
        const dateObj = new Date(date);
        const displayDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        button.textContent = displayDate;
        
        // Store the date as data attribute in the format used in the events data
        button.dataset.day = date;
        
        // Set initial state (default to active if not in saved filters)
        const isActive = savedFilters[date] !== undefined ? savedFilters[date] : true;
        if (isActive) {
            button.classList.add('active');
        }
        
        // Store filter state
        dayFilters[date] = isActive;
        
        // Add click handler
        button.addEventListener('click', () => {
            // Toggle active state
            const newState = !dayFilters[date];
            dayFilters[date] = newState;
            
            if (newState) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
            
            // Save to localStorage
            localStorage.setItem('dayFilters', JSON.stringify(dayFilters));
            
            // Update map and timeline
            updateVisibility(events);
        });
        
        filterContainer.appendChild(button);
    });
}

// Initialize tag filters
/*function initTagFilters(events) {
    // Get unique tags from all events
    const allTags = events.flatMap(event => event.tags);
    const uniqueTags = [...new Set(allTags)].filter(tag => tag); // Remove empty tags
    
    // Sort tags alphabetically
    uniqueTags.sort();
    
    // Load saved filter states from localStorage
    let savedFilters = {};
    try {
        const saved = localStorage.getItem('tagFilters');
        if (saved) {
            savedFilters = JSON.parse(saved);
        }
    } catch (e) {
        console.error('Error loading saved tag filters:', e);
    }
    
    // Create filter buttons
    const filterContainer = document.getElementById('tag-filters');
    
    uniqueTags.forEach(tag => {
        // Create button
        const button = document.createElement('div');
        button.className = 'tag-filter';
        button.textContent = tag;
        button.dataset.tag = tag;
        
        // Set initial state (default to active if not in saved filters)
        const isActive = savedFilters[tag] !== undefined ? savedFilters[tag] : true;
        if (isActive) {
            button.classList.add('active');
        }
        
        // Store filter state
        tagFilters[tag] = isActive;
        
        // Add click handler
        button.addEventListener('click', () => {
            // Toggle active state
            const newState = !tagFilters[tag];
            tagFilters[tag] = newState;
            
            if (newState) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
            
            // Save to localStorage
            localStorage.setItem('tagFilters', JSON.stringify(tagFilters));
            
            // Update map and timeline
            updateVisibility(events);
        });
        
        filterContainer.appendChild(button);
    });
}*/

// Update visibility of events based on filters
function updateVisibility(events) {
    const now = new Date();
    
    // Step 1: Find which days have future events
    const daysWithFutureEvents = {};
    events.forEach(event => {
        const eventEndTime = new Date(event.end);
        if (eventEndTime > now) {
            daysWithFutureEvents[event.date] = true;
        }
    });
    
    // Make sure we have at least some day buttons before trying to hide any
    const dayButtons = document.querySelectorAll('.day-filter:not(#favorites-filter)');
    if (dayButtons.length > 0) {
        // Step 2: Hide day filter buttons for days without future events
        dayButtons.forEach(button => {
            const day = button.dataset.day;
            
            if (day && !daysWithFutureEvents[day]) {
                button.style.display = 'none';
                dayFilters[day] = false;
            } else if (day) {
                button.style.display = '';
            }
        });
        
        // Step 3: Update button visibility after potentially hiding some buttons
        if (typeof updateScrollButtonVisibility === 'function') {
            updateScrollButtonVisibility();
        }
    }
    
    // Check if all day filters are inactive
    let allDaysInactive = true;
    for (const day in dayFilters) {
        if (dayFilters[day]) {
            allDaysInactive = false;
            break;
        }
    }
    
    // If all days are inactive, remove all markers
    if (allDaysInactive) {
        Object.values(markers).forEach(marker => {
            if (map.hasLayer(marker)) {
                map.removeLayer(marker);
            }
        });
        
        // Clear timeline and exit early
        d3.select('#gantt').html('');
        return;
    }
    
    // Get favorites from localStorage
    const favorites = JSON.parse(localStorage.getItem('favorites') || '{}');
    
    // Step 4: Filter events by day, favorites, and remove past events
    const filteredEvents = events.filter(event => {
        // Check if day is active
        const dayActive = dayFilters[event.date];
        
        // Check if event is not in the past
        const eventEndTime = new Date(event.end);
        const eventNotPast = eventEndTime > now;
        
        // Check if event is a favorite (if favorites filter is active)
        const isFavorite = favorites[event.uniqueId];
        const passesFilter = !favoritesFilterActive || isFavorite;
        
        const isVisible = dayActive && eventNotPast && passesFilter;
        
        return isVisible;
    });
    
    // Step 5: Update map markers
    Object.keys(markers).forEach(uniqueId => {
        const event = events.find(e => e.uniqueId === uniqueId);
        if (event) {
            const dayActive = dayFilters[event.date];
            const eventEndTime = new Date(event.end);
            const eventNotPast = eventEndTime > now;
            
            // Check if event is a favorite (if favorites filter is active)
            const isFavorite = favorites[event.uniqueId];
            const passesFilter = !favoritesFilterActive || isFavorite;
            
            const isVisible = dayActive && eventNotPast && passesFilter;
            const marker = markers[uniqueId];
            
            if (isVisible) {
                if (!map.hasLayer(marker)) {
                    marker.addTo(map);
                }
            } else {
                if (map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            }
        }
    });
    
    // Step 6: Redraw timeline with filtered events
    d3.select('#gantt').html('');
    if (filteredEvents.length > 0) {
        initTimeline(filteredEvents);
    }
}

// Add this function to assign colors based on chronological order
function getFestivalColor(index, totalFestivals) {
    const hue = (360 / totalFestivals) * index;
    return `hsl(${hue}, 100%, 30%)`; // Fixed saturation at 100% and lightness at 30%
}

function initMap(events) {
    // Center map on Austin with zoom controls disabled
    map = L.map('map', {
        zoomControl: false
    }).setView([30.2672, -97.7431], 13);
    
    // Custom map style with teal water
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '©OpenStreetMap, ©CartoDB',
        subdomains: 'abcd',
        maxZoom: 19,
        className: 'map-tiles'
    }).addTo(map);

    // Add custom CSS filter to change water color
    const style = document.createElement('style');
    style.textContent = `
        .map-tiles {
            filter: hue-rotate(20deg) saturate(1.42);
        }
    `;
    document.head.appendChild(style);

    // Add logo as a custom control
    L.Control.Logo = L.Control.extend({
        onAdd: function(map) {
            const img = L.DomUtil.create('img', 'map-logo');
            img.src = 'img/logo.png';
            img.style.width = '150px';
            return img;
        }
    });
    
    new L.Control.Logo({ position: 'topright' }).addTo(map);
    
    events.forEach(event => {
        // Only create markers for events with coordinates
        if (event.lat && event.lon) {
            const marker = L.marker([event.lat, event.lon], {
                icon: L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="background-color: ${getFestivalColor(events.indexOf(event), events.length)}"></div>`,
                    iconSize: [25, 41],
                    iconAnchor: [12, 41],
                    popupAnchor: [1, -34]
                })
            }).bindPopup(createPopupContent(event));
            
            // Use the unique ID instead of just the name
            markers[event.uniqueId] = marker;
            
            // Only add to map if day is active
            if (dayFilters[event.date]) {
                marker.addTo(map);
            }

            // Add click handler to marker
            marker.on('click', () => {
                // Highlight corresponding timeline bar
                d3.selectAll('.event-group rect')
                    .style('opacity', 0.8);
                d3.select(`rect[data-uniqueid="${event.uniqueId}"]`)
                    .style('opacity', 1);
            });
        }
    });
}

function createPopupContent(event) {
    const formatTime = (date) => date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
    });

    const locationHtml = event.loc ? 
        `<p><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.loc)}" target="_blank" class="location-link">${event.loc}</a></p>` :
        '';
    
    // Check if this event is a favorite
    const favorites = JSON.parse(localStorage.getItem('favorites') || '{}');
    const isFavorite = favorites[event.uniqueId] ? 'active' : '';

    const popupContent = `
        <div class="festival-popup">
            <span class="heart-icon ${isFavorite}" data-uniqueid="${event.uniqueId}">♥</span>
            <img src="img/${event.img}" alt="${event.name}">
            <h3>${event.name}</h3>
            <p>${event.desc}</p>
            ${locationHtml}
            <p>${formatTime(event.start)} - ${formatTime(event.end)}</p>
            <p>${event.tags.join(', ')}</p>
            <a href="${event.rsvp}" target="_blank" class="rsvp-button">RSVP</a>
        </div>
    `;

    return popupContent;
}

function initTimeline(events) {
    // Add original index to each event before sorting
    events.forEach((event, index) => {
        event.originalIndex = index;
    });
    
    // Sort events by start time (earliest first)
    events.sort((a, b) => a.start - b.start);

    // Get container width for responsive sizing
    const containerWidth = document.querySelector('.timeline-container').clientWidth;
    const isMobile = containerWidth < 768;
    
    const margin = {top: 20, right: 20, bottom: 30, left: 20}; // Reduced left margin since we don't need space for labels
    const hoursToShow = isMobile ? 8 : 24;
    const basePixelsPerHour = (containerWidth - margin.left - margin.right) / hoursToShow;
    const pixelsPerHour = isMobile ? basePixelsPerHour * 2 : basePixelsPerHour; // Double width on mobile
    
    // Get the full date range from all events
    const timeExtent = d3.extent(events.flatMap(d => [d.start, d.end]));
    const totalHours = (timeExtent[1] - timeExtent[0]) / (1000 * 60 * 60);
    const width = pixelsPerHour * totalHours;
    
    // Group events by date to organize them better
    const eventsByDate = {};
    events.forEach(event => {
        const dateKey = event.start.toLocaleDateString();
        if (!eventsByDate[dateKey]) {
            eventsByDate[dateKey] = [];
        }
        eventsByDate[dateKey].push(event);
    });
    
    // Create a flattened array of events with row assignments
    const rowAssignments = [];
    Object.values(eventsByDate).forEach(dateEvents => {
        // Sort events by start time within each date
        dateEvents.sort((a, b) => a.start - b.start);
        
        // Assign rows efficiently to avoid overlaps
        const rows = [];
        dateEvents.forEach(event => {
            // Find the first row where this event can fit
            let rowIndex = 0;
            while (true) {
                if (!rows[rowIndex]) {
                    rows[rowIndex] = [];
                }
                
                // Check if this event overlaps with any event in this row
                const canFit = !rows[rowIndex].some(existingEvent => {
                    return (event.start < existingEvent.end && event.end > existingEvent.start);
                });
                
                if (canFit) {
                    rows[rowIndex].push(event);
                    event.rowIndex = rowIndex;
                    rowAssignments.push(event);
                    break;
                }
                
                rowIndex++;
            }
        });
    });
    
    // Calculate height based on the number of rows needed
    const rowHeight = 40;
    const height = Math.max(...rowAssignments.map(e => e.rowIndex)) * rowHeight + rowHeight;
    
    // Create main SVG container
    const container = d3.select('#gantt');
    
    // Create header container for time axis
    const headerContainer = container.append('div')
        .attr('class', 'timeline-header')
        .style('overflow-x', 'hidden')
        .style('position', 'sticky')
        .style('top', '0')
        .style('background', 'white')
        .style('z-index', '1')
        .style('border-bottom', '1px solid #ccc');

    // Create SVG for the header
    const headerSvg = headerContainer.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', margin.top + 60) // Increase height to accommodate labels
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top - 10})`);

    // Add drag-to-scroll functionality
    let isDragging = false;
    let startX;
    let scrollLeft;

    const timelineContainer = container.append('div')
        .attr('class', 'scrollable-timeline')
        .style('overflow-x', 'auto')
        .style('margin-top', '-1px'); // Adjust for border overlap

    // Add mouse event listeners for drag scrolling
    timelineContainer.on('mousedown', function(event) {
        isDragging = true;
        startX = event.pageX - timelineContainer.node().offsetLeft;
        scrollLeft = timelineContainer.node().scrollLeft;
        
        // Change cursor to grabbing
        timelineContainer.style('cursor', 'grabbing');
    });

    timelineContainer.on('mouseleave', function() {
        isDragging = false;
        timelineContainer.style('cursor', null);
    });

    timelineContainer.on('mouseup', function() {
        isDragging = false;
        timelineContainer.style('cursor', null);
    });

    timelineContainer.on('mousemove', function(event) {
        if (!isDragging) return;
        
        event.preventDefault();
        const x = event.pageX - timelineContainer.node().offsetLeft;
        const walk = (x - startX) * 2; // Scroll speed multiplier
        timelineContainer.node().scrollLeft = scrollLeft - walk;
        
        // Keep header in sync
        headerContainer.node().scrollLeft = timelineContainer.node().scrollLeft;
    });

    // Create SVG for the timeline (remove the bottom margin since axis is now in header)
    const svg = timelineContainer.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales using the full time range
    const xScale = d3.scaleTime()
        .domain(timeExtent)
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain([0, Math.max(...rowAssignments.map(e => e.rowIndex)) + 1])
        .range([0, height]);

    // Add grid lines for hours
    svg.selectAll('line.grid')
        .data(xScale.ticks(d3.timeHour.every(1)))
        .enter()
        .append('line')
        .attr('class', 'grid')
        .attr('x1', d => xScale(d))
        .attr('x2', d => xScale(d))
        .attr('y1', 0)
        .attr('y2', height)
        .style('stroke', 'var(--teal)')
        .style('stroke-width', 1)
        .style('opacity', 0.5);
        
    // Add hour shading to clearly show hour boundaries
    const hourRects = svg.selectAll('rect.hour-background')
        .data(xScale.ticks(d3.timeHour.every(1)))
        .enter()
        .append('rect')
        .attr('class', 'hour-background')
        .attr('x', d => xScale(d))
        .attr('y', 0)
        .attr('width', d => {
            const hourEnd = new Date(d);
            hourEnd.setHours(hourEnd.getHours() + 1);
            return xScale(hourEnd) - xScale(d);
        })
        .attr('height', height)
        .style('fill', (d, i) => i % 2 === 0 ? 'rgba(248, 248, 248, 0.5)' : 'rgba(240, 240, 240, 0.5)')
        .style('stroke', 'none');

    // Create groups for each event bar
    const eventGroups = svg.selectAll('.event-group')
        .data(rowAssignments)
        .enter()
        .append('g')
        .attr('class', 'event-group')
        .attr('transform', d => `translate(0,${yScale(d.rowIndex)})`);

    // Add bars with updated interaction
    eventGroups.append('rect')
        .attr('x', d => xScale(d.start))
        .attr('y', 0)
        .attr('width', d => Math.max(xScale(d.end) - xScale(d.start), 30))
        .attr('height', rowHeight * 0.8)
        .attr('data-name', d => d.name) // Keep this for backward compatibility
        .attr('data-uniqueid', d => d.uniqueId) // Add data attribute for the unique ID
        .style('fill', (d) => getFestivalColor(d.originalIndex, events.length))
        .style('opacity', 0.8)
        .on('mouseover', function(event, d) {
            // Only change opacity on hover
            d3.select(this).style('opacity', 1);
        })
        .on('mouseout', function(event, d) {
            // Reset opacity unless this bar is "selected"
            if (!this.classList.contains('selected')) {
                d3.select(this).style('opacity', 0.8);
            }
        })
        .on('click', function(event, d) {
            event.stopPropagation(); // Stop event from bubbling up
            
            // Remove selection from all bars
            d3.selectAll('.event-group rect')
                .style('opacity', 0.8)
                .classed('selected', false);
            
            // Select this bar
            d3.select(this)
                .style('opacity', 1)
                .classed('selected', true);

            // Remove any existing timeline popups
            d3.selectAll('.timeline-popup').remove();

            // Close any open map popups
            map.closePopup();

            // If there's a marker, show its popup - use the unique ID
            if (markers[d.uniqueId]) {
                map.panTo(markers[d.uniqueId].getLatLng());
                markers[d.uniqueId].openPopup();
            } else {
                // For events without location data, create a popup in the timeline
                const popupContent = createPopupContent(d);
                
                // Get the position of the clicked bar
                const rect = this.getBoundingClientRect();
                
                // Calculate a visible position in the viewport
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                
                // Create the popup first to get its dimensions
                const popup = d3.select('body')
                    .append('div')
                    .attr('class', 'timeline-popup')
                    .style('position', 'fixed')
                    .style('left', `${viewportWidth / 2}px`)
                    .style('opacity', '0') // Hide initially to measure size
                    .html(popupContent);
                
                // Add a close button to the popup
                popup.append('div')
                    .attr('class', 'close-button')
                    .html('×')
                    .on('click', () => {
                        popup.remove();
                        document.removeEventListener('click', closePopup);
                    });
                    
                // Now get the popup dimensions
                const popupHeight = popup.node().offsetHeight;
                
                // Decide best position - if clicked in lower half of screen, position popup above
                // If clicked in upper half, position below
                let popupTop;
                let arrowClass = '';
                
                if (rect.top > viewportHeight / 2) {
                    // Position above the click point if in bottom half of screen
                    popupTop = Math.max(20, rect.top - popupHeight - 20);
                    arrowClass = 'arrow-bottom';
                } else {
                    // Position below the click point if in top half of screen
                    popupTop = Math.min(rect.bottom + 20, viewportHeight - popupHeight - 20);
                    arrowClass = 'arrow-top';
                }
                
                // Update the popup position and make it visible
                popup
                    .classed(arrowClass, true)
                    .style('top', `${popupTop}px`)
                    .style('transform', 'translateX(-50%)')
                    .style('opacity', '1');
                
                // Add click handler to close popup when clicking outside
                const closePopup = (e) => {
                    const clickedPopup = e.target.closest('.timeline-popup');
                    if (!clickedPopup && e.target !== this) {
                        popup.remove();
                        document.removeEventListener('click', closePopup);
                    }
                };
                
                // Delay adding the click listener to prevent immediate closure
                requestAnimationFrame(() => {
                    document.addEventListener('click', closePopup);
                });
            }
        });

    // Add labels on bars
    const eventLabels = eventGroups.append('g')
        .attr('class', 'event-label-group');

    // Add event name
    eventLabels.append('text')
        .attr('class', 'event-label')
        .attr('x', d => xScale(d.start) + 5) // Always position text at start of bar with small padding
        .attr('y', rowHeight * 0.4)
        .attr('dy', '0.35em')
        .style('fill', '#fff') // Always use white text
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .text(d => d.name);

    // Add time axis to the header
    const xAxis = d3.axisTop(xScale)
        .ticks(d3.timeHour.every(1))
        .tickFormat(d3.timeFormat('%-I %p'))
        .tickSize(10); // Increase tick size for better visibility
    
    // Add the axis
    const axis = headerSvg.append('g')
        .attr('transform', `translate(0,${margin.top})`)
        .call(xAxis);

    // Style the time tick labels
    axis.selectAll('.tick text')
        .style('text-anchor', 'middle') // Center text under the tick
        .attr('dy', '3.5em') // Position below the tick line instead of above
        .style('font-weight', 'bold')
        .style('font-size', isMobile ? '12px' : '10px');
        
    // Style the axis path and ticks
    axis.select('.domain')
        .style('stroke', 'var(--teal)')
        .style('stroke-width', 2);
        
    axis.selectAll('.tick line')
        .style('stroke', 'var(--teal)')
        .style('stroke-width', 2)
        .attr('y2', 10); // Extend tick lines downward for better visibility

    // Add date labels above specific hour ticks (6 AM, 12 PM, 6 PM)
    axis.selectAll('.tick')
        .filter(d => {
            const hour = d.getHours();
            return hour === 6 || hour === 12 || hour === 18;
        })
        .append('text')
        .attr('class', 'date-label')
        .attr('x', 0)
        .attr('y', -15)
        .style('text-anchor', 'middle')
        .style('font-weight', 'bold')
        .style('fill', '#666')
        .style('font-size', isMobile ? '14px' : '12px') // Make date labels more prominent
        .text(d => {
            const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${date}`;
        });

    // Sync horizontal scrolling between header and timeline
    timelineContainer.on('scroll', function() {
        headerContainer.node().scrollLeft = this.scrollLeft;
    });

    // Add current time indicator
    function addCurrentTimeIndicator() {
        // Remove any existing time indicator
        svg.selectAll('.current-time-indicator').remove();
        
        const now = new Date();
        const currentX = xScale(now);
        
        // Only show if current time is within the visible range
        if (currentX >= 0 && currentX <= width) {
            // Add a vertical line for current time
            svg.append('line')
                .attr('class', 'current-time-indicator')
                .attr('x1', currentX)
                .attr('y1', 0)
                .attr('x2', currentX)
                .attr('y2', height)
                .attr('stroke', 'red')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '5,5');
        }
    }
    
    // Initial call to add the indicator
    addCurrentTimeIndicator();
    
    // Update the time indicator every minute
    const timeUpdateInterval = setInterval(addCurrentTimeIndicator, 60000);
    
    // Clean up interval on page unload
    window.addEventListener('beforeunload', () => {
        clearInterval(timeUpdateInterval);
    });
}

// Add scroll button functionality
function initScrollButtons() {
    // Day filter scroll buttons
    const dayContainer = document.getElementById('day-filters');
    const dayScrollLeft = document.getElementById('day-scroll-left');
    const dayScrollRight = document.getElementById('day-scroll-right');
    
    // Tag filter scroll buttons
    /*const tagContainer = document.getElementById('tag-filters');
    const tagScrollLeft = document.getElementById('tag-scroll-left');
    const tagScrollRight = document.getElementById('tag-scroll-right');*/
    
    // Scroll amount (pixels)
    const scrollAmount = 150;
    
    // Day filter scroll handlers
    dayScrollLeft.addEventListener('click', () => {
        dayContainer.scrollBy({
            left: -scrollAmount,
            behavior: 'smooth'
        });
    });
    
    dayScrollRight.addEventListener('click', () => {
        dayContainer.scrollBy({
            left: scrollAmount,
            behavior: 'smooth'
        });
    });
    
    // Tag filter scroll handlers
    /*tagScrollLeft.addEventListener('click', () => {
        tagContainer.scrollBy({
            left: -scrollAmount,
            behavior: 'smooth'
        });
    });
    
    tagScrollRight.addEventListener('click', () => {
        tagContainer.scrollBy({
            left: scrollAmount,
            behavior: 'smooth'
        });
    });*/
    
    // Update button visibility based on scroll position
    function updateScrollButtonVisibility() {
        // Day filter buttons
        dayScrollLeft.style.opacity = dayContainer.scrollLeft > 0 ? '1' : '0.3';
        dayScrollRight.style.opacity = 
            dayContainer.scrollLeft < (dayContainer.scrollWidth - dayContainer.clientWidth - 5) ? '1' : '0.3';
        
        // Tag filter buttons
        /*tagScrollLeft.style.opacity = tagContainer.scrollLeft > 0 ? '1' : '0.3';
        tagScrollRight.style.opacity = 
            tagContainer.scrollLeft < (tagContainer.scrollWidth - tagContainer.clientWidth - 5) ? '1' : '0.3';*/
    }
    
    // Add scroll event listeners to update button visibility
    dayContainer.addEventListener('scroll', updateScrollButtonVisibility);
    //tagContainer.addEventListener('scroll', updateScrollButtonVisibility);
    
    // Initial visibility update
    updateScrollButtonVisibility();
    
    // Update on window resize
    window.addEventListener('resize', updateScrollButtonVisibility);
}

// Main initialization
async function init() {
    const events = await loadData();
    
    // Store all events globally for filtering
    allEvents = events;
    
    // Initialize filters first
    initDayFilters(events);
    
    // Create favorites filter after day filters
    createFavoritesFilter();
    
    //initTagFilters(events);
    initScrollButtons(); // Initialize scroll buttons
    
    // Then initialize map and timeline with filtered events
    initMap(events);
    
    // Initial filtering including removing past events
    updateVisibility(events);
    
    // Check if we need to show the favorites filter
    updateFavoritesFilter();
    
    // Add event listener for heart icon clicks
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('heart-icon')) {
            e.stopPropagation(); // Prevent popup from closing
            e.target.classList.toggle('active');
            
            // Get the event ID from the data attribute
            const eventId = e.target.getAttribute('data-uniqueid');
            
            // Save to localStorage
            saveFavorite(eventId, e.target.classList.contains('active'));
            
            // Force update visibility to reflect changes immediately
            updateVisibility(allEvents);
        }
    });
    
    // Initialize social share buttons
    initSocialShare();
    
    // Set up a timer to periodically update the view to remove completed events and update day filters
    setInterval(() => updateVisibility(events), 5 * 60000); // Update every 5 minutes
}

// Function to create the favorites filter
function createFavoritesFilter() {
    const filterContainer = document.getElementById('day-filters');
    
    // Check if the favorites filter already exists
    if (document.getElementById('favorites-filter')) {
        return;
    }
    
    // Create favorites filter button
    const favoritesFilter = document.createElement('div');
    favoritesFilter.className = 'day-filter';
    favoritesFilter.id = 'favorites-filter';
    favoritesFilter.textContent = '❤ Favorites';
    
    // Initially hide the favorites filter if there are no favorites
    const shouldShow = hasFavorites();
    if (!shouldShow) {
        favoritesFilter.style.display = 'none';
    }
    
    // Add click handler
    favoritesFilter.addEventListener('click', () => {
        // Toggle active state
        favoritesFilterActive = !favoritesFilterActive;
        
        if (favoritesFilterActive) {
            favoritesFilter.classList.add('active');
        } else {
            favoritesFilter.classList.remove('active');
        }
        
        // Update map and timeline
        updateVisibility(allEvents);
    });
    
    // Insert at the beginning of the filter container
    filterContainer.insertBefore(favoritesFilter, filterContainer.firstChild);
}

// Function to save favorite status to localStorage
function saveFavorite(eventId, isFavorite) {
    // Get existing favorites from localStorage
    let favorites = JSON.parse(localStorage.getItem('favorites') || '{}');
    
    // Update the favorite status
    favorites[eventId] = isFavorite;
    
    // Save back to localStorage
    localStorage.setItem('favorites', JSON.stringify(favorites));
    
    // Check if we need to show or hide the favorites filter
    updateFavoritesFilter();
}

// Function to check if there are any favorited events
function hasFavorites() {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '{}');
    
    // Check if there are any favorites with value true
    const hasFavs = Object.entries(favorites).some(([key, value]) => {
        return value === true;
    });
    
    return hasFavs;
}

// Function to update the favorites filter visibility
function updateFavoritesFilter() {
    let favoritesFilter = document.getElementById('favorites-filter');
    
    // If the favorites filter doesn't exist yet, we need to create it
    if (!favoritesFilter) {
        // Only create it if there are favorites
        if (hasFavorites()) {
            createFavoritesFilter();
            favoritesFilter = document.getElementById('favorites-filter');
        } else {
            // No favorites and no filter, nothing to do
            return;
        }
    }
    
    if (hasFavorites()) {
        favoritesFilter.style.display = '';
    } else {
        favoritesFilter.style.display = 'none';
        // If the favorites filter was active, deactivate it
        if (favoritesFilter.classList.contains('active')) {
            favoritesFilter.classList.remove('active');
            favoritesFilterActive = false;
            updateVisibility(allEvents);
        }
    }
}

// Function to initialize social share buttons
function initSocialShare() {
    const pageUrl = encodeURIComponent('https://sxfreesw.com');
    const pageTitle = encodeURIComponent('sxFREEsw - A Festival of FREE Timeline & Map');
    const pageDescription = encodeURIComponent('Discover free events during SXSW with an interactive timeline and map. Find, favorite, and plan your festival experience!');
    
    // Twitter share
    const twitterShare = document.querySelector('.twitter-share');
    twitterShare.href = `https://twitter.com/intent/tweet?url=${pageUrl}&text=${pageTitle}`;
    twitterShare.target = '_blank';
    
    // Facebook share
    const facebookShare = document.querySelector('.facebook-share');
    facebookShare.href = `https://www.facebook.com/sharer/sharer.php?u=${pageUrl}`;
    facebookShare.target = '_blank';
    
    // LinkedIn share
    const linkedinShare = document.querySelector('.linkedin-share');
    linkedinShare.href = `https://www.linkedin.com/sharing/share-offsite/?url=${pageUrl}`;
    linkedinShare.target = '_blank';
    
    // Copy link button
    const copyLink = document.querySelector('.copy-link');
    copyLink.addEventListener('click', function() {
        // Create a temporary input element
        const tempInput = document.createElement('input');
        tempInput.value = 'https://sxfreesw.com';
        document.body.appendChild(tempInput);
        
        // Select and copy the link
        tempInput.select();
        document.execCommand('copy');
        
        // Remove the temporary input
        document.body.removeChild(tempInput);
        
        // Visual feedback
        copyLink.classList.add('copied');
        
        // Create toast notification
        let toast = document.querySelector('.toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'toast';
            toast.textContent = 'Link copied to clipboard!';
            document.body.appendChild(toast);
        }
        
        // Show the toast
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        // Hide the toast after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            copyLink.classList.remove('copied');
        }, 3000);
    });
    
    // Generate social share image if it doesn't exist
    generateSocialShareImage();
}

// Function to generate a social share image
function generateSocialShareImage() {
    // Check if we're in a browser environment with canvas support
    if (typeof document === 'undefined' || !document.createElement('canvas').getContext) {
        return;
    }
    
    // Create a canvas element
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    
    // Set background color (teal from your CSS variables)
    ctx.fillStyle = '#2A9D8F';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add a pattern or texture to the background
    ctx.fillStyle = '#238A7E';
    for (let i = 0; i < canvas.width; i += 20) {
        for (let j = 0; j < canvas.height; j += 20) {
            if ((i + j) % 40 === 0) {
                ctx.fillRect(i, j, 10, 10);
            }
        }
    }
    
    // Add title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 80px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('sxFREEsw', canvas.width / 2, canvas.height / 2 - 50);
    
    // Add subtitle
    ctx.font = '40px Arial, sans-serif';
    ctx.fillText('A Festival of FREE Timeline & Map', canvas.width / 2, canvas.height / 2 + 30);
    
    // Add URL
    ctx.font = '30px Arial, sans-serif';
    ctx.fillText('sxfreesw.com', canvas.width / 2, canvas.height / 2 + 100);
    
    // Add a border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 20;
    ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);
    
    // Convert canvas to data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    
    // In a production environment, you would save this image to your server
    // This would typically be done server-side, not in the browser
    
    // For development, just log that the image was generated
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('Social share image generated. Use the favicon generator to create and download images.');
    }
}

init(); 