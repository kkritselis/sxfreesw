/**
 * Favicon and Social Share Image Generator for sxFREEsw
 * 
 * This script generates favicon files and a social share image for the sxFREEsw website.
 * Run this in a browser console or as a Node.js script with Canvas support.
 */

// Function to generate favicon
function generateFavicon(size) {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Background color (teal)
    ctx.fillStyle = '#2A9D8F';
    ctx.fillRect(0, 0, size, size);
    
    // Add text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Adjust font size based on canvas size
    const fontSize = Math.floor(size * 0.5);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    
    // Draw "sx" text
    ctx.fillText('sx', size / 2, size / 2);
    
    return canvas.toDataURL('image/png');
}

// Function to generate social share image
function generateSocialShareImage() {
    // Create canvas
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
    
    return canvas.toDataURL('image/jpeg', 0.8);
}

// Generate different sizes
const sizes = [16, 32, 180]; // 16x16, 32x32, 180x180 (apple-touch-icon)
const fileNames = ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png'];

// If running in a browser
if (typeof document !== 'undefined') {
    // Create a container to display the icons
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.fontFamily = 'Arial, sans-serif';
    container.innerHTML = '<h2>sxFREEsw Favicon Generator</h2><p>Right-click on each icon and select "Save image as..." to download.</p>';
    
    // Generate and display each size
    sizes.forEach((size, index) => {
        const dataUrl = generateFavicon(size);
        
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = '20px';
        
        const img = document.createElement('img');
        img.src = dataUrl;
        img.style.border = '1px solid #ccc';
        img.style.marginRight = '10px';
        
        const label = document.createElement('span');
        label.textContent = `${size}x${size} (${fileNames[index]})`;
        
        wrapper.appendChild(img);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
    
    // Add social share image
    const socialShareWrapper = document.createElement('div');
    socialShareWrapper.style.marginTop = '40px';
    socialShareWrapper.style.marginBottom = '20px';
    socialShareWrapper.innerHTML = '<h2>Social Share Image</h2><p>Right-click on the image and select "Save image as..." to download as "social-share.jpg".</p>';
    
    const socialShareImg = document.createElement('img');
    socialShareImg.src = generateSocialShareImage();
    socialShareImg.style.width = '100%';
    socialShareImg.style.maxWidth = '600px';
    socialShareImg.style.border = '1px solid #ccc';
    socialShareImg.style.marginTop = '10px';
    
    socialShareWrapper.appendChild(socialShareImg);
    container.appendChild(socialShareWrapper);
    
    // Add to document
    document.body.appendChild(container);
    
    console.log('Image generator loaded. Right-click on the icons to save them.');
}

// If running in Node.js with Canvas support
// You would need to save the files to disk
// This is just a placeholder for that functionality
/*
const fs = require('fs');
const { createCanvas } = require('canvas');

sizes.forEach((size, index) => {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Same drawing code as above
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(fileNames[index], buffer);
    console.log(`Generated ${fileNames[index]}`);
});

// Generate social share image
const socialCanvas = createCanvas(1200, 630);
// ... drawing code ...
const socialBuffer = socialCanvas.toBuffer('image/jpeg');
fs.writeFileSync('social-share.jpg', socialBuffer);
console.log('Generated social-share.jpg');
*/ 