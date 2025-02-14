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
        </div>
    `;
}

function initTimeline(events) {
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
        .attr('height', margin.top + 40) // Height for time labels
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scrollable container for timeline
    const timelineContainer = container.append('div')
        .attr('class', 'scrollable-timeline')
        .style('overflow-x', 'auto')
        .style('margin-top', '-1px'); // Adjust for border overlap

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
        .style('stroke', '#ddd')
        .style('stroke-width', 1)
        .style('opacity', 0.5);

    // Create groups for each event bar
    const eventGroups = svg.selectAll('.event-group')
        .data(events)
        .enter()
        .append('g')
        .attr('class', 'event-group')
        .attr('transform', d => `translate(0,${yScale(d.name)})`);

    // Add bars
    eventGroups.append('rect')
        .attr('x', d => xScale(d.start))
        .attr('y', 0)
        .attr('width', d => Math.max(xScale(d.end) - xScale(d.start), 30))
        .attr('height', yScale.bandwidth())
        .style('fill', (d, i) => getFestivalColor(i, events.length))
        .style('opacity', 0.8)
        .on('mouseover', function(event, d) {
            d3.select(this).style('opacity', 1);
            if (markers[d.name]) {
                markers[d.name].openPopup();
            }
        })
        .on('mouseout', function(event, d) {
            d3.select(this).style('opacity', 0.8);
        });

    // Add labels on bars
    eventGroups.append('text')
        .attr('class', 'event-label')
        .attr('x', d => {
            const barWidth = xScale(d.end) - xScale(d.start);
            // If bar is too narrow, place text after the bar
            if (barWidth < 100) {
                return xScale(d.end) + 5;
            }
            return xScale(d.start) + 5;
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
    const xAxis = d3.axisTop(xScale) // Changed to axisTop
        .ticks(d3.timeHour.every(1))
        .tickFormat(d3.timeFormat('%I:%M %p'));
    
    headerSvg.append('g')
        .call(xAxis)
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '0.5em')
        .attr('transform', 'rotate(-45)');

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