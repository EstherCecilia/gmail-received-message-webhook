const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");

// Send notification:
function send(author, date, subject, message, attachments) {
  const regex = /(.*)\s<(.+)>/;
  const matches = author.match(regex);
  const name = matches[1];
  const email = matches[2];
  console.log({ author, name, email, date, subject, message, attachments });
}

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = "token.json";

// Load client secrets from a local file.
fs.readFile("credentials.json", (err, content) => {
  if (err) return console.log("Error loading client secret file:", err);
  // Authorize a client with credentials, then call the Gmail API.
  //setInterval(() => {
  authorize(JSON.parse(content), getRecentEmail);
  //}, 5000);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log("Token stored to", TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

function getRecentEmail(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  // Only get the recent email - 'maxResults' parameter
  let nbResult = 10;
  let lastSended = [];
  setInterval(() => {
    gmail.users.messages.list(
      { auth: auth, userId: "me", maxResults: nbResult },
      function (err, response) {
        if (err) {
          console.log("The API returned an error: " + err);
          return;
        }

        for (let i = 0; i < nbResult; i++) {
          let message_id = response["data"]["messages"][i]["id"];
          gmail.users.messages.get(
            { auth: auth, userId: "me", id: message_id },
            function (err, response) {
              let author = "";
              let date = "";
              let subject = "";
              let message = "";
              let messageId = response["data"]["id"];

              if (err) {
                console.log("The API returned an error: " + err);
                return;
              }
              for (
                let j = 0;
                j < response["data"]["payload"]["headers"].length;
                j++
              ) {
                switch (response["data"]["payload"]["headers"][j].name) {
                  case "From":
                    author = response["data"]["payload"]["headers"][j].value;
                    break;
                  case "Date":
                    date = response["data"]["payload"]["headers"][j].value;
                    break;
                  case "Subject":
                    subject = response["data"]["payload"]["headers"][j].value;
                    break;
                }
              }
              if (response["data"]["payload"]["parts"]) {
                data = response["data"]["payload"]["parts"]
                  .filter((body) => body["body"]["data"])
                  .map((part) => part["body"]["data"]);
                attachments = response["data"]["payload"]["parts"]
                  .filter((body) => body["body"]["attachmentId"])
                  .map((part) => ({
                    partId: part.partId,
                    mimeType: part.mimeType,
                    filename: part.filename,
                    attachmentId: part.body.attachmentId,
                    size: part.body.size,
                  }));
                  
                if (data) {
                  buff = new Buffer.from(data, "base64");
                  message = buff.toString();

                  if (!lastSended.includes(response["data"]["id"])) {
                    if (lastSended.length >= nbResult) {
                      lastSended.shift();
                    }
                    send(author, date, subject, message, attachments);
                    lastSended.push(response["data"]["id"]);
                  }
                }
              }
            }
          );
        }
      }
    );
    console.log(
      "Checking for new emails in time " + new Date().toLocaleString()
    );
  }, 20000);
}
