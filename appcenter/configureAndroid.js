const a = require('axios');
const { submitConfigAndBuild, getFromS3 } = require('./utils');
const isHigherThanLatest = require('./isHigherThanLatest');

const currBranch = process.env.BITBUCKET_BRANCH;
const println = message => console.log('[Android] ', message);

const axios = a.create({
  baseURL: `https://appcenter.ms/api/v0.1/apps/ZAP/Consumer-Android/branches/${encodeURIComponent(currBranch)}`,
  headers: { 'X-API-Token': process.env.APPCENTER_API_TOKEN },
});

const getKeystore = () => getFromS3('android/keystore.json');

const getSigning = () => getFromS3('android/signing.keystore');

const fetchVersionJson = () =>
  a
    .get('https://s3-ap-southeast-1.amazonaws.com/zap.consumer.app/versions/default/android.json')
    .then(res => res.data);

const getBetaDistributionId = () =>
  a
    .get('https://appcenter.ms/api/v0.1/apps/ZAP/Consumer-Android/distribution_stores', {
      headers: { 'X-API-Token': process.env.APPCENTER_API_TOKEN },
    })
    .then(res => [...res.data].find(v => v.name === 'Beta'));

const run = () => {
  println(`Branch name: ${currBranch}`);
  println('Checking if build is configured');
  return (
    axios
      .get('/config')
      // .then(() => println('Build is already configured'))
      .then(() => {
        println('Configuring Android Appcenter build...');
        return axios
          .get('/toolset_projects?os=Android&platform=React-Native')
          .then(async (res) => {
            println('Successfully Fetched toolset for Android...');
            const isHigher = await isHigherThanLatest(fetchVersionJson);
            println(isHigher
              ? 'Local Version is Higher than latest released version'
              : 'Local version is lower than latest version');
            println('Fetching available Distribution Stores in Appcenter...');
            const betaDistribution = await getBetaDistributionId();
            println(`Selected Distribution: ${JSON.stringify(betaDistribution)}`);
            const shouldSetDistribution = isHigher && RegExp(/^release\//).test(currBranch);

            const distribution = shouldSetDistribution
              ? {
                destinationId: betaDistribution.id,
                distributionGroupId: betaDistribution.id,
                releaseNotes: 'Set by bitbucket pipeline',
              }
              : {};
            println(` Distribution config is set to: ${JSON.stringify(distribution)}`);
            const keystoreConfig = shouldSetDistribution
              ? {
                ...JSON.parse((await getKeystore()).toString()),
                keystoreEncoded: (await getSigning()).toString('base64'),
                keystoreFilename: 'signing.keystore',
              }
              : {};
            println('Keystore successfully fetched from S3');

            const json = res.data;
            const js = json.javascript.javascriptSolutions[0];
            const android = json.android.androidModules[0];
            const { buildscripts } = json;
            const buildConfig = {
              toolsets: {
                javascript: {
                  runTests: true,
                  ...js,
                },
                android: {
                  gradleWrapperPath: android.gradleWrapperPath,
                  buildVariant: 'release',
                  runTests: true,
                  module: android.name,
                  ...keystoreConfig,
                },
                buildscripts,
                distribution,
              },
              environmentVariables: [
                {
                  name: 'APPCENTER_API_TOKEN',
                  value: process.env.APPCENTER_API_TOKEN,
                },
                {
                  name: 'APP_NAME',
                  value: 'Consumer-Android',
                },
                { name: 'AWS_ACCESS_KEY_ID', value: process.env.AWS_ACCESS_KEY_ID },
                { name: 'AWS_SECRET_ACCESS_KEY', value: process.env.AWS_SECRET_ACCESS_KEY },
              ],
              trigger: 'continuous',
              badgeIsEnabled: true,
            };
            println('Successfully Generated Build Config....');
            return submitConfigAndBuild(axios, buildConfig, json.commit, println);
          })
          .catch((err) => {
            throw err;
          });
      })
  );
};

module.exports = run;
