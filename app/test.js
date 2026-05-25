const http = require('http');

console.log('Running backend health check...');

// Step 1: Query landing page
const req = http.get('http://localhost:3000/', (res) => {
  const { statusCode } = res;
  console.log(`Landing page status code: ${statusCode}`);
  
  if (statusCode === 200) {
    console.log('Health check PASSED.');
    process.exit(0);
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
