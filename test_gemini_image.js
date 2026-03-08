// Test Gemini 3.1 Flash-Lite with image
const fs = require('fs');

const GEMINI_API_KEY = 'AIzaSyC2rlfn9aTeZzRMP-wmMx2pVtLeoDDv7NY';

async function testWithImage() {
  console.log('Testing Gemini 3.1 Flash-Lite with image...\n');

  // Check for any saved camera images
  const files = fs.readdirSync('.').filter(f => f.endsWith('.png'));

  let base64Image;
  if (files.length === 0) {
    console.log('No PNG files found. Using tiny test image...');
    // A valid 1x1 red PNG
    base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  } else {
    const imageFile = files[0];
    console.log('Using image:', imageFile);
    const imageBuffer = fs.readFileSync(imageFile);
    base64Image = imageBuffer.toString('base64');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'What do you see in this image? Describe briefly.' },
            { inline_data: { mime_type: 'image/png', data: base64Image } }
          ]
        }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 100,
        }
      })
    });

    console.log('Status:', response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error('Error:', error);
      return;
    }

    const data = await response.json();
    console.log('Response:', data.candidates?.[0]?.content?.parts?.[0]?.text);
    console.log('\nMultimodal working!');

  } catch (error) {
    console.error('Failed:', error.message);
  }
}

testWithImage();
