let map;
let markers = {};
let activePopup = null;

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

        // Create the event object
        const event = {
            name,
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

// Add this function to assign colors based on chronological order
function getFestivalColor(index, totalFestivals) {
    const hue = (360 / totalFestivals) * index;
    return `hsl(${hue}, 85%, 50%)`; // Using 85% saturation for slightly softer colors
}

function initMap(events) {
    // Center map on Austin
    map = L.map('map').setView([30.2672, -97.7431], 13);
    
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
            
            markers[event.name] = marker;
            marker.addTo(map);

            // Add click handler to marker
            marker.on('click', () => {
                // Highlight corresponding timeline bar
                d3.selectAll('.event-group rect')
                    .style('opacity', 0.8);
                d3.select(`rect[data-name="${event.name}"]`)
                    .style('opacity', 1);
            });
        }
    });
}

function createPopupContent(event) {
    return `
        <div class="festival-popup">
            <img src="img/${event.img}" alt="${event.name}">
            <h3>${event.name}</h3>
            <p>${event.desc}</p>
            <p>${event.loc}</p>
            <p>${event.start.toLocaleTimeString()} - ${event.end.toLocaleTimeString()}</p>
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
    const height = events.length * 40; // Increased height per bar to accommodate labels
    
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

    const yScale = d3.scaleBand()
        .domain(events.map(d => d.name))
        .range([0, height])
        .padding(0.3); // Increased padding between bars

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
        .data(events)
        .enter()
        .append('g')
        .attr('class', 'event-group')
        .attr('transform', d => `translate(0,${yScale(d.name)})`);

    // Add bars with updated interaction
    eventGroups.append('rect')
        .attr('x', d => xScale(d.start))
        .attr('y', 0)
        .attr('width', d => Math.max(xScale(d.end) - xScale(d.start), 30))
        .attr('height', yScale.bandwidth())
        .attr('data-name', d => d.name) // Add data attribute for easier selection
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
            // Remove selection from all bars
            d3.selectAll('.event-group rect')
                .style('opacity', 0.8)
                .classed('selected', false);
            
            // Select this bar
            d3.select(this)
                .style('opacity', 1)
                .classed('selected', true);

            // Show popup for corresponding marker
            if (markers[d.name]) {
                map.panTo(markers[d.name].getLatLng());
                markers[d.name].openPopup();
            }
        });

    // Add labels on bars
    const eventLabels = eventGroups.append('g')
        .attr('class', 'event-label-group');

    // Add event name
    eventLabels.append('text')
        .attr('class', 'event-label')
        .attr('x', d => {
            const barWidth = xScale(d.end) - xScale(d.start);
            return barWidth < 100 ? xScale(d.end) + 5 : xScale(d.start) + 5;
        })
        .attr('y', yScale.bandwidth() / 2)
        .attr('dy', '0.35em')
        .style('fill', d => {
            const barWidth = xScale(d.end) - xScale(d.start);
            return barWidth < 100 ? '#000' : '#fff';
        })
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .text(d => d.name);

    // Add time axis to the header
    const xAxis = d3.axisTop(xScale)
        .ticks(d3.timeHour.every(1))
        .tickFormat(d3.timeFormat('%I:%M %p'));
    
    // Add the axis
    const axis = headerSvg.append('g')
        .attr('transform', `translate(0,${margin.top})`)
        .call(xAxis);

    // Style the time tick labels
    axis.selectAll('.tick text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '1.4em')
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
            // const period = d.getHours() === 12 ? 'noon' : 
            //               d.getHours() === 18 ? '6pm' : 
            //               '6am';
            return `${date}`;
        });

    // Sync horizontal scrolling between header and timeline
    timelineContainer.on('scroll', function() {
        headerContainer.node().scrollLeft = this.scrollLeft;
    });
}

// Main initialization
async function init() {
    const events = await loadData();
    initMap(events);
    initTimeline(events);
}

init(); 