// Test Gemini 3.1 Flash-Lite Preview - most cost-efficient model
const GEMINI_API_KEY = 'AIzaSyC2rlfn9aTeZzRMP-wmMx2pVtLeoDDv7NY';

async function testGemini() {
  console.log('Testing Gemini 3.1 Flash-Lite Preview...\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Say "hello robot" in 3 words max' }]
        }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 50,
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
    console.log('\nGemini 3.1 Flash-Lite is working!');

  } catch (error) {
    console.error('Failed:', error.message);
  }
}

testGemini();
