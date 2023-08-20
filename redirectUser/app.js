// const axios = require('axios')
// const url = 'http://checkip.amazonaws.com/';
let response;

const axios = require("axios");
const AWS = require("aws-sdk");

const NODE_ENV = "development";
const APP_ENTRY_POINT = "https://portal.isomarkets.com/api/redirect";
const CLIENT_ID = "3p0nrtgrkfdmvr481rrmdv8vrl";
const DOMAIN_URL = "https://appserver.auth.us-east-1.amazoncognito.com";
const COOKIE_EXPIRE_DAYS = 7;

const redirect = `${DOMAIN_URL}/login?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${APP_ENTRY_POINT}`;
const MAIN = "https://portal.isomarkets.com";

async function getObjectWrapper(bucket, key) {
  return new Promise((resolve, reject) => {
    var s3 = new AWS.S3();
    var params = {
      Bucket: bucket,
      Key: key,
    };
    s3.getObject(params, function (err, data) {
      if (err) {
        console.log(err, err.stack); // an error occurred
        reject(err);
      } else {
        const objectData = data.Body.toString("utf-8");
        resolve(objectData);
        console.log("success");
      }
    });
  });
}

function putObjectWrapper(bucket, key, data) {
  return new Promise((resolve, reject) => {
    var s3 = new AWS.S3();
    var params = {
      Bucket: bucket,
      Key: key,
      Body: data,
    };
    s3.putObject(params, function (err, data) {
      if (err) {
        console.log(err, err.stack); // an error occurred
        reject(err);
      } else {
        resolve(data);
        console.log("success");
      }
    });
  });
}

function getTokenA(refreshToken, code) {
  return new Promise((resolve, reject) => {
    console.log("new get token code = ", code);
    const parms = !refreshToken
      ? {
          grant_type: "authorization_code",
          client_id: `${CLIENT_ID}`,
          code,
          redirect_uri: `${APP_ENTRY_POINT}`,
        }
      : {
          grant_type: "refresh_token",
          client_id: `${CLIENT_ID}`,
          refresh_token: refreshToken,
          redirect_uri: `${APP_ENTRY_POINT}`,
        };

    axios
      .post(`${DOMAIN_URL}/oauth2/token`, null, {
        params: parms,
      })
      .then((response) => {
        console.log("got response");
        resolve(response);
      })
      .catch((error) => {
        console.log("got error");
        console.log("get token error=", error);
        reject(error);
      });
  });
}

async function getUserInfoA(accessToken) {
  return new Promise((resolve, reject) => {
    axios
      .get(`${DOMAIN_URL}/oauth2/userInfo`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      .then((response) => {
        resolve(response);
      })
      .catch((error) => {
        console.log("user info error response = ", error);
        reject(error);
      });
  });
}

exports.lambdaHandler = async (event, _context) => {
  console.log("Handler called.  event=", JSON.stringify(event));

  let userName;

  if (event.headers && event.headers.cookie) {
    const search = "userName=";
    const sampleUser = "89640ccd-6d81-498d-a7cf-c63c4a6f73bc";

    let start = event.headers.cookie.indexOf(search);

    console.log("start = ", start);
    console.log("cookie = ", event.headers.cookie);

    if (start !== -1) {
      start = start + search.length;
      userName = event.headers.cookie.substring(
        start,
        start + sampleUser.length
      );
    }
  }

  if (userName) {
    console.log("username = ", userName);

    let tokens;

    try {
      console.log("token validation/refresh 1");

      tokens = await getObjectWrapper(
        "user-tokens-fbf5be13-8cae-4eac-8c83-c80ceaf542c3",
        userName
      );

      console.log("token validation/refresh 2");

      tokens = JSON.parse(tokens);
      console.log("user validation ", tokens);

      console.log("token validation/refresh 3");

      try {
        tokens.accessToken;
        await getUserInfoA(tokens.access_token);
        console.log("token validation/refresh 4");

        return Promise.resolve({
          statusCode: 302,
          headers: { Location: MAIN },
        });
      } catch (e) {
        console.log("token validation/refresh 5");

        //try to refresh
        try {
          console.log("token validation/refresh 6");

          const newAccessToken = await getTokenA(tokens.refresh_token);

          console.log("token validation/refresh 6a");

          console.log("newAccessToken =", newAccessToken);

          const newTokens = {
            ...tokens,
            access_token: newAccessToken.data.access_token,
          };

          console.log("token validation/refresh 7");

          await putObjectWrapper(
            "user-tokens-fbf5be13-8cae-4eac-8c83-c80ceaf542c3",
            userName,
            JSON.stringify(newTokens)
          );

          console.log("token validation/refresh 8");

          return Promise.resolve({
            statusCode: 302,
            headers: { Location: MAIN },
          });
        } catch (e) {
          console.log("token validation/refresh 9");

          console.log("failed to refresh token error = " + e);

          return Promise.resolve({
            statusCode: 302,
            headers: { Location: redirect },
            body: "Failed to read access token from s3 check permissions ",
          });
        }
      }
    } catch (e) {
      console.log(
        "Failed to read access token from s3 check permissions. " + e
      );

      return Promise.resolve({
        statusCode: 200,
        headers: { Location: redirect },
        body: "Failed to read access token from s3 check permissions ",
      });
    }
  }

  const queryStringParameters = event.queryStringParameters;

  const hasCode =
    queryStringParameters != null && event.queryStringParameters.code;

  if (hasCode) {
    console.log("we have a code");
    console.log("hascode 1");

    let newAccessToken;
    let tokens;
    try {
      const response = await getTokenA(false, event.queryStringParameters.code);

      console.log("getTokenA response =", response);
      newAccessToken = response.data.access_token;
      tokens = response.data;

      console.log("hascode 2");
    } catch (e) {
      console.log("hascode -1 error = ", e);

      return Promise.resolve({
        statusCode: 302,
        headers: { Location: redirect },
      });
    }

    let userName;
    try {
      console.log("hascode 3");
      const response = await getUserInfoA(newAccessToken);
      userName = response.data.username;
    } catch (e) {
      console.log("hascode -2");
      return Promise.resolve({
        statusCode: 200,
        body: "there was a problem getting userInfo",
      });
    }

    try {
      await putObjectWrapper(
        "user-tokens-fbf5be13-8cae-4eac-8c83-c80ceaf542c3",
        userName,
        JSON.stringify(tokens)
      );
      console.log("hascode 4");

      return Promise.resolve({
        statusCode: 302,
        body: "yo dere and here's your token\n" + newAccessToken,
        headers: {
          Location: MAIN,
          "Access-Control-Allow-Origin": "https://portal.isomarkets.com",
          "Access-Control-Allow-Credentials": true,
          "access-control-expose-headers": "Set-Cookie",
          "Set-Cookie": `userName=${userName}`,
        },
      });
    } catch (e) {
      console.log("hascode -3");

      return Promise.resolve({
        statusCode: 200,
        body: "there was a problem writing userInfo check permissions",
      });
    }
  } else {
    console.log("NO code 1 ");
    return Promise.resolve({
      statusCode: 302,
      headers: { Location: redirect },
    });
  }
};
