export function renderSettings(code: string, value: string | null) {
	let body = "";

	if (!code) {
		body = `<p>Belum login. Buka <a href="/">/</a> untuk login.</p>`;
	} else if (!value) {
		body = `<p>Session not found in KV.</p><p>Code: <code>${code}</code></p>`;
	} else {
		let parsed: Record<string, unknown> | null = null;
		try {
			parsed = JSON.parse(value);
		} catch {
			parsed = null;
		}

		if (!parsed) {
			body = `<p>Value KV bukan JSON valid.</p><pre><code>${value}</code></pre>`;
		} else {
			const id = String(parsed.id ?? "-");
			const alg = String(parsed.alg ?? "-");
			const created = Number(parsed.created ?? 0);
			const createdStr = created
				? new Date(created).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
				: "-";
			const publicKey = String(parsed.publicKey ?? "-");
			const privateKeyLen = String(parsed.privateKey ?? "").length;

			body = `
        <table>
          <tr><td><strong>Session ID</strong></td><td><code>${id}</code></td></tr>
          <tr><td><strong>Algorithm</strong></td><td><code>${alg}</code></td></tr>
          <tr><td><strong>Created</strong></td><td>${createdStr}</td></tr>
          <tr><td><strong>Public Key</strong></td><td><pre><code>${publicKey}</code></pre></td></tr>
          <tr><td><strong>Private Key</strong></td><td><em>hidden (${privateKeyLen} chars)</em></td></tr>
        </table>
      `;
		}
	}

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
          ${body}
          <form id="logoutForm" method="POST" action="/logout">
            <button type="submit">Logout</button>
          </form>
        </main>
        <script>
          document.getElementById("logoutForm").addEventListener("submit", function () {
            localStorage.clear();
            sessionStorage.clear();
          });
        </script>
      </body>
    </html>
`;
}
