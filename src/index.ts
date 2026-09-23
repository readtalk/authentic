import { issuer } from "@openauthjs/openauth";
import {
	CloudflareStorage,
	type CloudflareStorageOptions,
} from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";

const subjects = createSubjects({
	user: object({
		id: string(),
	}),
});

function SettingsHTML(userId: string, email: string) {
	return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>READTalk Messenger</title>
        <style>
          body {
            font-family: system-ui, sans-serif;
            max-width: 600px;
            margin: 40px auto;
            padding: 0 20px;
            background: #f0f2f5;
            color: #111b21;
          }
          .card {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          h1 { margin-top: 0; color: #000000; }
          .info { margin: 16px 0; }
          .label { font-weight: 600; color: #667781; }
          .logout-btn {
            background: #000000;
            color: white;
            border: none;
            padding: 10px 24px;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            margin-top: 20px;
          }
          .logout-btn:hover { background: #1a1a1a; }
          #loading { text-align: center; margin-top: 40px; }
        </style>
      </head>
      <body>
        <div id="loading">Loading...</div>
        <div id="dashboard" style="display:none;">
          <div class="card">
            <h4>Form @username?</h4>            
            <div class="info"><span class="label">Key ID:</span> <span id="userId">${userId}</span></div>
            <div class="info"><span class="label">Email:</span> <span id="email">${email}</span></div>
            <button onclick="logout()" class="logout-btn">Logout</button>
          </div>
        </div>
        <script>
          (function() {
            const urlParams = new URLSearchParams(window.location.search);
            const userId = urlParams.get('user_id');
            const email = urlParams.get('email');

            if (userId && email) {
              localStorage.setItem('user_id', userId);
              localStorage.setItem('email', email);
              const cleanUrl = window.location.origin + window.location.pathname;
              window.history.replaceState({}, document.title, cleanUrl);
            }

            const savedUserId = localStorage.getItem('user_id');
            const savedEmail = localStorage.getItem('email');
            if (savedUserId && savedEmail) {
              document.getElementById('userId').textContent = savedUserId;
              document.getElementById('email').textContent = savedEmail;
              document.getElementById('loading').style.display = 'none';
              document.getElementById('dashboard').style.display = 'block';
            } else {
              document.getElementById('loading').textContent = 'No session found. Please login to https://authentication.readtalk.workers.dev';
            }
          })();

          function logout() {
            localStorage.removeItem('user_id');
            localStorage.removeItem('email');
            window.location.href = '/';
          }
        </script>
      </body>
    </html>
  `;
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/settings") {
			const userId = url.searchParams.get("user_id") || "user_123";
			const email = url.searchParams.get("email") || "user@example.com";
			const html = SettingsHTML(userId, email);
			return new Response(html, {
				headers: { "Content-Type": "text/html" },
			});
		}

		if (url.pathname === "/logout") {
			const response = Response.redirect("/");
			response.headers.set("Set-Cookie", "session=; Max-Age=0; path=/");
			return response;
		}

		if (url.pathname === "/") {
			url.searchParams.set("redirect_uri", url.origin + "/settings");
			url.searchParams.set("client_id", "your-client-id");
			url.searchParams.set("response_type", "code");
			url.pathname = "/authorize";
			return Response.redirect(url.toString());
		}

		if (url.pathname === "/callback") {
			return Response.json({
				message: "OAuth flow complete!",
				params: Object.fromEntries(url.searchParams.entries()),
			});
		}

		return issuer({
			storage: CloudflareStorage({
				namespace: env.AUTH_KV as CloudflareStorageOptions["namespace"],
			}),
			subjects,
			providers: {
				password: PasswordProvider(
					PasswordUI({
						sendCode: async (email, code) => {
							console.log(`Sending code ${code} to ${email}`);
						},
						copy: {
							input_code: "Code (check Worker logs)",
						},
					}),
				),
			},
			theme: {
				title: "READTalk Messenger",
				primary: "#000000",
				favicon: "https://raw.githubusercontent.com/readtalk/authentication/refs/heads/main/public/favicon.ico",
				logo: {
					dark: "https://raw.githubusercontent.com/readtalk/authentication/refs/heads/main/public/brand.png",
					light:
						"https://raw.githubusercontent.com/readtalk/authentication/refs/heads/main/public/brand.png",
				},
			},
			success: async (ctx, value) => {
				const userId = await getOrCreateUser(env, value.email);
				const baseUrl = "https://authentic.readtalk.workers.dev";
				return Response.redirect(
					`${baseUrl}/settings?user_id=${userId}&email=${encodeURIComponent(value.email)}`,
					302
				);
			},
		}).fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;

async function getOrCreateUser(env: Env, email: string): Promise<string> {
	const result = await env.AUTH_DB.prepare(
		`
		INSERT INTO user (email)
		VALUES (?)
		ON CONFLICT (email) DO UPDATE SET email = email
		RETURNING id;
		`,
	)
		.bind(email)
		.first<{ id: string }>();
	if (!result) {
		throw new Error(`Unable to process user: ${email}`);
	}
	console.log(`Found or created user ${result.id} with email ${email}`);
	return result.id;
}
