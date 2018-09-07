const configAndroid = require('./configureAndroid');
const configIOS = require('./configureIOS');

process.on('unhandledRejection', (reason) => {
  // If encountered a failed promise -> fail build
  // console.log(reason);
  console.log('Unhandled Promise Rejection:', reason.stack || reason);
  process.exit(1);
});

configAndroid();
configIOS();
