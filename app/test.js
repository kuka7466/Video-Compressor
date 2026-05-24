const http = require('http');

console.log('Running backend health check and self-shutdown validation...');

// Step 1: Query landing page
const req = http.get('http://localhost:3000/', (res) => {
  const { statusCode } = res;
  console.log(`Landing page status code: ${statusCode}`);
  
  if (statusCode === 200) {
    console.log('Health check PASSED. Hitting shutdown API...');
    
    // Step 2: Trigger self-shutdown API
    const shutdownReq = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/shutdown',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, (shutdownRes) => {
      console.log(`Shutdown API status code: ${shutdownRes.statusCode}`);
      if (shutdownRes.statusCode === 200) {
        console.log('Clean shutdown triggered successfully. Verification PASSED.');
        process.exit(0);
      } else {
        console.error('Failed to trigger shutdown.');
        process.exit(1);
      }
    });

    shutdownReq.on('error', (err) => {
      console.error('Error hitting shutdown API:', err.message);
      process.exit(1);
    });

    shutdownReq.end();
  } else {
    console.error(`Health check FAILED. Expected 200, got ${statusCode}`);
    process.exit(1);
  }
});

req.on('error', (err) => {
  console.error('Health check failed with error:', err.message);
  process.exit(1);
});

// Set a timeout of 5 seconds
req.setTimeout(5000, () => {
  console.error('Health check request timed out.');
  req.destroy();
  process.exit(1);
});
