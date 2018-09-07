const a = require('axios');

const { submitConfigAndBuild, getFromS3, uploadFileAsset } = require('./utils');
const isHigherThanLatest = require('./isHigherThanLatest');

const currBranch = process.env.BITBUCKET_BRANCH;
const baseUrl = 'https://appcenter.ms/api/v0.1/apps/ZAP/Consumer-iOS';
const axios = a.create({
  baseURL: `${baseUrl}/branches/${encodeURIComponent(currBranch)}`,
  headers: { 'X-API-Token': process.env.APPCENTER_API_TOKEN },
});

// configure axios to log http req and res details
axios.interceptors.request.use((request) => {
  console.log('-----REQUEST-----');
  console.log('Headers:', request.headers);
  console.log('Method:', request.method);
  console.log('URL:', request.url);
  console.log('Data:', request.data);
  return request;
});
axios.interceptors.response.use((response) => {
  console.log('-----RESPONSE-----');
  console.log(response.data);
  return response;
});
const println = (message) => console.log('[IOS] ', message);

// fetch a version file in s3 that indicates versioning in the mobile app
const fetchVersionJson = () =>
  a
    .get(
      'https://s3-ap-southeast-1.amazonaws.com/zap.consumer.app/versions/default/ios.json',
    )
    .then((res) => res.data);

const getTestFlightDistributionId = () =>
  axios
    .get(
      'https://appcenter.ms/api/v0.1/apps/ZAP/Consumer-iOS/distribution_stores',
      {
        headers: { 'X-API-Token': process.env.APPCENTER_API_TOKEN },
      },
    )
    .then((res) =>
      [...res.data].find((v) => v.name === 'iTunes Connect users'),
    );

const run = () => {
  println(`Branch name: ${currBranch}`);
  println('Checking if build is configured');
  // get config -> if not configured -> configure 
  return axios
    .get('/config')
    .then(() => println('Build is already configured.'))
    .catch(() => {
      println('Configuring IOS Appcenter build...');
      Promise.all([
        axios.get('/toolset_projects?os=iOS&platform=React-Native'),
        a.get(`${baseUrl}/xcode_versions`, {
          headers: { 'X-API-Token': process.env.APPCENTER_API_TOKEN },
        }),
      ])
        .then(async (responses) => {
          println('Successfully Fetched toolset and Xcode Version');
          // if current version is higher than latest -> configure signing and distribution to test flight
          const isHigher = await isHigherThanLatest(fetchVersionJson);
          println(
            isHigher
              ? 'Local Version is Higher than latest released version'
              : 'Local version is lower than latest version',
          );
          println('Fetching available Distribution Stores in Appcenter...');
          const tfDistribution = await getTestFlightDistributionId();
          println(`Selected Distribution: ${JSON.stringify(tfDistribution)}`);
          const shouldSetDistribution =
            isHigher && RegExp(/^release\//).test('release/'); // force succeed since this is for testing
          const distribution = shouldSetDistribution
            ? {
                destinationId: tfDistribution.id,
                distributionGroupId: tfDistribution.id,
                releaseNotes: 'Set by bitbucket pipeline',
              }
            : {};

          const [toolSetRes, xcodeRes] = responses;
          const currXCodeV = xcodeRes.data.find((v) => v.current);
          const json = toolSetRes.data;
          const { buildscripts, javascript, xcode } = json;
          const js = javascript.javascriptSolutions[0];
          const lastSchemeContainer = xcode.xcodeSchemeContainers.slice(-1)[0];
          const xcodeSigningConfig = await (async () => {
            if (shouldSetDistribution) {
              const certFileName = 'Certificates.p12';
              const provisioningFileName =
                'consumerwildcardstore.mobileprovision';
              const certBuff = await getFromS3(`ios/${certFileName}`);
              const certificateUploadId = await uploadFileAsset({
                buffer: certBuff,
                name: certFileName,
              });
              const provisionBuff = await getFromS3(
                `ios/${provisioningFileName}`,
              );
              const provisioningProfileUploadId = await uploadFileAsset({
                buffer: provisionBuff,
                name: provisioningFileName,
              });
              return {
                provisioningProfileUploadId,
                provisioningProfileFilename,
                certificateUploadId,
                certificateFilename,
                certificatePassword: '',
              };
            }
            return {};
          })();
          const buildConfig = {
            toolsets: {
              distribution,
              javascript: {
                runTests: true,
                ...js,
              },
              buildscripts,
              xcode: {
                projectOrWorkspacePath: lastSchemeContainer.path,
                scheme: lastSchemeContainer.sharedSchemes[0].name,
                xcodeVersion: currXCodeV.name || '9.4.1',
                xcodeProjectSha: `https://api.bitbucket.org/2.0/repositories/zaptag/consumer-app/src/${
                  json.commit
                }/ios/ConsumerApp.xcodeproj/project.pbxproj`,
                archiveConfiguration:
                  lastSchemeContainer.sharedSchemes[0].archiveConfiguration,
                targetToArchive:
                  lastSchemeContainer.sharedSchemes[0].archiveProject
                    .archiveTargetId,
                ...xcodeSigningConfig,
              },
            },
            environmentVariables: [
              {
                name: 'APPCENTER_API_TOKEN',
                value: process.env.APPCENTER_API_TOKEN,
              },
              {
                name: 'APP_NAME',
                value: 'Consumer-iOS',
              },
              {
                name: 'AWS_ACCESS_KEY_ID',
                value: process.env.AWS_ACCESS_KEY_ID,
              },
              {
                name: 'AWS_SECRET_ACCESS_KEY',
                value: process.env.AWS_SECRET_ACCESS_KEY,
              },
            ],
            trigger: 'continuous',
            testsEnabled: true,
            badgeIsEnabled: true,
            branch: {
              name: currBranch,
            },
          };
          println('Successfully Generated BuildConfig...');
          return submitConfigAndBuild(axios, buildConfig, json.commit, println);
        })
        .catch((err) => {
          throw err;
        });
    });
};

module.exports = run;
