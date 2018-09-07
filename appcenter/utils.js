const axios = require('axios');
const AWS = require('aws-sdk');
const fs = require('fs');
const { promisify } = require('util');
const { bucketName } = require('./constants');

const readFileAsync = promisify(fs.readFile);

const s3 = new AWS.S3();
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

const submitConfigAndBuild = (fetcher, buildConfig, commit, println) =>
  fetcher
    .post('/config', buildConfig, {
      headers: {
        Accept: '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9,fil;q=0.8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        Host: 'appcenter.ms',
        Origin: 'https://appcenter.ms',
        Pragma: 'no-cache',
        Referer:
          'https://appcenter.ms/orgs/ZAP/apps/Consumer-iOS/build/branches/ZRC-4243-fix-comfacebookreactcommonjavas/configure',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36',
      },
    })
    .then(() => {
      println('Configured Build Success...');
      fetcher
        .post('/builds', {
          sourceVersion: commit,
        })
        .then(() => {
          println(`Build queued for commit ID:${commit}`);
        });
    })
    .catch(() => {
      fetcher.put('/config', buildConfig).then(() => {
        fetcher
          .post('/builds', {
            sourceVersion: commit,
          })
          .then(() => {
            println(`Build queued for commit ID:${commit}`);
          });
      });
    });

const uploadResHandler = (errMessage) => (res) => {
  const { data } = res;
  // console.log(data);
  // if (data.error) throw new Error(errMessage);
  return data;
};
const getFileAsset = () =>
  axios
    .post(
      'https://appcenter.ms/api/v0.1/apps/ZAP/Consumer-iOS/file_asset',
      {},
      {
        headers: { 'X-API-Token': process.env.APPCENTER_API_TOKEN },
      },
    )
    .then((res) => res.data);

const getFromS3 = (path) =>
  new Promise((resolve, reject) => {
    s3.getObject(
      {
        Bucket: bucketName,
        Key: path,
      },
      (err, data) => {
        if (err) {
          reject(err);
        }
        resolve(data.Body);
      },
    );
  });

const setMetaData = (uploadDomain, uploadId, fileName, fileSize, token) =>
  axios
    .post(
      `${uploadDomain}/upload/set_metadata/${uploadId}`,
      {},
      {
        params: {
          file_name: fileName,
          file_Size: fileSize,
          token,
        },
      },
    )
    .then(uploadResHandler('Upload Set Meta Data Failed'));

const uploadBlockOne = async (uploadDomain, uploadId, buffer, token) =>
  axios
    .post(
      `${uploadDomain}/upload/upload_chunk/${uploadId}`,
      buffer.toString('binary'),
      {
        params: {
          block_number: 1,
          token,
        },
        headers: {
          'Content-Type': 'application/x-binary',
          'Content-Length': buffer.byteLength,
          Accept: '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9,fil;q=0.8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          Host: 'file.appcenter.ms',
          Origin: 'https://appcenter.ms',
          Pragma: 'no-cache',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36',
        },
      },
    )
    .then(uploadResHandler('Upload Block One failed'));

const uploadFinished = (uploadDomain, uploadId, token) =>
  axios
    .post(
      `${uploadDomain}/upload/finished/${uploadId}`,
      {},
      {
        params: {
          token,
        },
      },
    )
    .then(uploadResHandler('Upload Finished Request failed'));

const uploadFileAsset = async (fileDetails, x, type) => {
  // GET file asset -> set metadata -> block 1 -> upload finished
  const { buffer, name } = fileDetails;
  const { id: uploadId, uploadDomain, token } = await getFileAsset();
  await setMetaData(uploadDomain, uploadId, name, buffer.byteLength, token);
  // await uploadFinished(uploadDomain, uploadId, token);
  await uploadBlockOne(uploadDomain, uploadId, buffer, token, type);
  // await uploadBlockOne(uploadDomain, uploadId, buffer, token);
  await uploadFinished(uploadDomain, uploadId, token);
  return uploadId;
};

module.exports = { submitConfigAndBuild, uploadFileAsset, getFromS3 };
