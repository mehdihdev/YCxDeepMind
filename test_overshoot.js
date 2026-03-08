// Test Overshoot API v0.2
const OVERSHOOT_API_KEY = 'ovs_c60b05204d538098e1f2da4d0e58e09d';
const BASE_URL = 'https://api.overshoot.ai/v0.2';

async function testOvershoot() {
  console.log('Testing Overshoot API v0.2...');
  console.log('API Key:', OVERSHOOT_API_KEY.substring(0, 10) + '...\n');

  // 1. List available models
  console.log('--- Listing Models ---');
  try {
    const modelsRes = await fetch(`${BASE_URL}/models`, {
      headers: { 'Authorization': `Bearer ${OVERSHOOT_API_KEY}` }
    });
    console.log('Status:', modelsRes.status);

    if (modelsRes.ok) {
      const models = await modelsRes.json();
      console.log('Available models:');
      models.forEach(m => {
        console.log(`  - ${m.model} (${m.status}, ready: ${m.ready})`);
      });
    } else {
      console.log('Error:', await modelsRes.text());
    }
  } catch (e) {
    console.log('Failed:', e.message);
  }

  // 2. Create a stream for single-frame inference
  console.log('\n--- Creating Stream ---');
  try {
    const streamRes = await fetch(`${BASE_URL}/streams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OVERSHOOT_API_KEY}`
      },
      body: JSON.stringify({
        mode: 'frame',
        processing: {
          interval_seconds: 1
        },
        inference: {
          prompt: 'Describe what you see in the image',
          model: 'Qwen/Qwen3.5-9B',
          max_output_tokens: 100
        }
      })
    });

    console.log('Status:', streamRes.status);

    if (streamRes.ok) {
      const stream = await streamRes.json();
      console.log('Stream created!');
      console.log('Stream ID:', stream.stream_id);
      console.log('LiveKit URL:', stream.livekit?.url);
      console.log('TTL:', stream.lease?.ttl_seconds, 'seconds');

      // Close the stream
      console.log('\n--- Closing Stream ---');
      const closeRes = await fetch(`${BASE_URL}/streams/${stream.stream_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${OVERSHOOT_API_KEY}` }
      });
      console.log('Close status:', closeRes.status);
      const closeData = await closeRes.json();
      console.log('Close response:', closeData);

      console.log('\nOvershoot API is working!');
    } else {
      const error = await streamRes.text();
      console.log('Error:', error);
    }
  } catch (e) {
    console.log('Failed:', e.message);
  }
}

testOvershoot();
