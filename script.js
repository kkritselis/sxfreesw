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
    const container = d3.select('#gantt');
    const margin = {top: 20, right: 20, bottom: 30, left: 200};
    const width = 2000 - margin.left - margin.right;
    const height = events.length * 30;
    
    // Create SVG
    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const timeExtent = d3.extent(events.flatMap(d => [d.start, d.end]));
    
    const xScale = d3.scaleTime()
        .domain(timeExtent)
        .range([0, width]);

    const yScale = d3.scaleBand()
        .domain(events.map(d => d.name))
        .range([0, height])
        .padding(0.2);

    // Add timeline bars
    svg.selectAll('rect')
        .data(events)
        .enter()
        .append('rect')
        .attr('x', d => xScale(d.start))
        .attr('y', d => yScale(d.name))
        .attr('width', d => Math.max(xScale(d.end) - xScale(d.start), 30))
        .attr('height', yScale.bandwidth())
        .style('fill', (d, i) => getFestivalColor(i, events.length))
        .style('opacity', 0.8)
        .on('mouseover', function(event, d) {
            d3.select(this).style('opacity', 1);
            // Highlight corresponding map marker if it exists
            if (markers[d.name]) {
                markers[d.name].openPopup();
            }
        })
        .on('mouseout', function(event, d) {
            d3.select(this).style('opacity', 0.8);
        });

    // Add axes
    const xAxis = d3.axisBottom(xScale)
        .ticks(d3.timeHour.every(1))
        .tickFormat(d3.timeFormat('%I:%M %p'));
    
    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');

    svg.append('g')
        .call(d3.axisLeft(yScale));
}

// Initialize controls
function initControls() {
    const container = document.querySelector('.timeline-container');
    
    document.getElementById('scrollLeft').addEventListener('click', () => {
        container.scrollLeft -= 200;
    });
    
    document.getElementById('scrollRight').addEventListener('click', () => {
        container.scrollLeft += 200;
    });
}

// Main initialization
async function init() {
    const events = await loadData();
    initMap(events);
    initTimeline(events);
    initControls();
}

init(); 