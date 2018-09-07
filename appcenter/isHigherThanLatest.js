const { promisify } = require('util');
const fs = require('fs');

const readFileAsync = promisify(fs.readFile);

const getCurrentVersion = () =>
  readFileAsync('./package.json').then((data) => {
    const packageJson = JSON.parse(data);
    const [major, minor, patch] = [...packageJson.version.split('.')].map(v => parseInt(v, 10));
    return { major, minor, patch };
  });

const isHigherThanLatest = async (fetchVersionJson) => {
  const { latest: latestVersion } = await fetchVersionJson();
  const currVersion = await getCurrentVersion();
  if (currVersion.major > latestVersion.major) {
    return true;
  } else if (currVersion.minor > latestVersion.minor && currVersion.major === latestVersion.major) {
    return true;
  } else if (
    currVersion.patch > latestVersion.patch &&
    currVersion.major === latestVersion.major &&
    currVersion.minor === latestVersion.minor
  ) {
    return true;
  }
  return false;
};

module.exports = isHigherThanLatest;
