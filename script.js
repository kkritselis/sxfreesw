let map;
let markers = {};
let activePopup = null;
let dayFilters = {}; // Store active state of day filters
// let tagFilters = {}; // Store active state of tag filters

async function loadData() {
    const response = await fetch('data.tsv');
    const text = await response.text();
    const rows = text.split('\n')
        .filter(row => row.trim())
        .slice(1); // Skip header
    
    return rows.map(row => {
        const [name, date, timeRange, lat, lon, loc, tags, rsvp, img, desc] = row.split('\t').map(field => field.trim());
        
        // Parse the date and time range
        const [startTime, endTime] = timeRange.split(' - ');
        
        // Create full datetime strings by combining date and times
        const startDateTime = new Date(`${date} ${startTime}`);
        const endDateTime = new Date(`${date} ${endTime}`);
        
        // For events that span past midnight
        if (endDateTime < startDateTime) {
            endDateTime.setDate(endDateTime.getDate() + 1);
        }

        // Create a unique ID for each event combining name and date
        const uniqueId = `${name}_${date}`;

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
    const dayButtons = document.querySelectorAll('.day-filter');
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
    
    // Step 4: Filter events by day and remove past events
    const filteredEvents = events.filter(event => {
        // Check if day is active
        const dayActive = dayFilters[event.date];
        
        // Check if event is not in the past
        const eventEndTime = new Date(event.end);
        const eventNotPast = eventEndTime > now;
        
        return dayActive && eventNotPast;
    });
    
    // Step 5: Update map markers
    Object.keys(markers).forEach(name => {
        const event = events.find(e => e.name === name);
        if (event) {
            const dayActive = dayFilters[event.date];
            const eventEndTime = new Date(event.end);
            const eventNotPast = eventEndTime > now;
            
            const isVisible = dayActive && eventNotPast;
            const marker = markers[name];
            
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
    initTimeline(filteredEvents);
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

    // Only create Google Maps link if location exists
    const locationHtml = event.loc ? 
        `<p><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.loc)}" target="_blank" class="location-link">${event.loc}</a></p>` :
        '';

    return `
        <div class="festival-popup">
            <img src="img/${event.img}" alt="${event.name}">
            <h3>${event.name}</h3>
            <p>${event.desc}</p>
            ${locationHtml}
            <p>${formatTime(event.start)} - ${formatTime(event.end)}</p>
            <p>${event.tags.join(', ')}</p>
            <a href="${event.rsvp}" target="_blank" class="rsvp-button">RSVP</a>
        </div>
    `;
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
    const pixelsPerHour = (containerWidth - margin.left - margin.right) / hoursToShow;
    
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
        .attr('height', margin.top + 50) // Height for time labels
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
                
                // Create and position the popup
                const popup = d3.select('body')
                    .append('div')
                    .attr('class', 'timeline-popup')
                    .style('position', 'fixed')
                    .style('left', `${rect.left + rect.width/2}px`)
                    .style('top', `${rect.top - 10}px`)
                    .style('transform', 'translate(-50%, -100%)')
                    .html(popupContent);
                
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
        .tickFormat(d3.timeFormat('%-I %p'));
    
    // Add the axis
    const axis = headerSvg.append('g')
        .attr('transform', `translate(0,${margin.top})`)
        .call(xAxis);

    // Style the time tick labels
    axis.selectAll('.tick text')
        .style('text-anchor', 'end')
        .attr('dx', '-3.5em')
        .attr('dy', '-1em')
        .attr('transform', 'rotate(-45)');

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
    
    // Initialize filters first
    initDayFilters(events);
    //initTagFilters(events);
    initScrollButtons(); // Initialize scroll buttons
    
    // Then initialize map and timeline with filtered events
    initMap(events);
    
    // Initial filtering including removing past events
    updateVisibility(events);
    
    // Set up a timer to periodically update the view to remove completed events and update day filters
    setInterval(() => updateVisibility(events), 5 * 60000); // Update every 5 minutes
}

init(); 