export function renderSettings() {
	return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>READTalk - Settings</title>
        <link rel="stylesheet" type="text/css" href="https://static.integrations.cloudflare.com/styles.css">
      </head>
      <body>
        <header>
          <img
            src="https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/30e0d3f6-6076-40f8-7abb-8a7676f83c00/public"
          />
          <h1>READTalk Settings</h1>
        </header>
        <main>
          <p>Kamu sudah login.</p>
          <form method="POST" action="/logout">
            <button type="submit">Logout</button>
          </form>
        </main>
      </body>
    </html>
`;
}
