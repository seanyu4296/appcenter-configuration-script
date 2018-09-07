const fs = require('fs');
const { existsSync, mkdirSync } = require('fs');

module.exports = () => {
  const awsDir = `${process.env.HOME}/.aws`;
  if (!existsSync(awsDir)) mkdirSync(awsDir);
  fs.writeFileSync(
    `${process.env.HOME}/.aws/config`,
    `[default]
region = ap-southeast-1
output = json
`,
  );
  const keyId = process.env.AWS_ACCESS_KEY_ID;
  const accessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (keyId && accessKey) {
    fs.writeFileSync(
      `${process.env.HOME}/.aws/credentials`,
      `[default]
aws_access_key_id = ${keyId}
aws_secret_access_key = ${accessKey}
  `,
    );
  } else {
    throw new Error('No AWS credentials in the current environment.');
  }
};
