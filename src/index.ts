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
	user: object({ id: string() }),
});

async function SettingsHTML(env: Env, userId: string, email: string) {
	const user = await env.AUTH_DB.prepare(
		`SELECT username, display_name, avatar, links FROM user WHERE id = ?`
	).bind(userId).first<{
		username: string | null;
		display_name: string | null;
		avatar: string | null;
		links: string | null;
	}>();

	const links = user?.links ? JSON.parse(user.links) : {};

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
        </style>
      </head>
      <body>
        <div class="card">
          <h4>Form @username?</h4>
          <div class="info"><span class="label">Key ID:</span> ${userId}</div>
          <div class="info"><span class="label">Email:</span> ${email}</div>
          <div class="info"><span class="label">Username:</span> ${user?.username || "-"}</div>
          <div class="info"><span class="label">Display Name:</span> ${user?.display_name || "-"}</div>
          <div class="info"><span class="label">Avatar:</span> ${user?.avatar || "-"}</div>
          <div class="info"><span class="label">Links:</span> ${JSON.stringify(links)}</div>
          <button onclick="logout()" class="logout-btn">Logout</button>
        </div>
        <script>
          function logout() {
            window.location.href = '/';
          }
        </script>
      </body>
    </html>
  `;
}

export default {
	fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
		const url = new URL(request.url);

		if (url.pathname === "/settings") {
			const sessionId = url.searchParams.get("session");

			if (!sessionId) {
				return Response.redirect(url.origin + "/", 302);
			}

			const session = await env.AUTH_KV.get(`session:${sessionId}`, "json") as {
				userId: string;
				email: string;
			} | null;

			if (!session) {
				return Response.redirect(url.origin + "/", 302);
			}

			const html = await SettingsHTML(env, session.userId, session.email);
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
			url.searchParams.set("redirect_uri", url.origin + "/callback");
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
						copy: { input_code: "Code (check Worker logs)" },
					}),
				),
			},
			theme: {
				title: "READTalk Messenger",
				primary: "#000000",
				favicon: "https://raw.githubusercontent.com/readtalk/authentication/refs/heads/main/public/favicon.ico",
				logo: {
					dark: "https://raw.githubusercontent.com/readtalk/authentication/refs/heads/main/public/brand.png",
					light: "https://raw.githubusercontent.com/readtalk/authentication/refs/heads/main/public/brand.png",
				},
			},
			success: async (ctx, value) => {
				const userId = await getOrCreateUser(env, value.email);
				const sessionId = crypto.randomUUID();

				await env.AUTH_KV.put(
					`session:${sessionId}`,
					JSON.stringify({ userId, email: value.email }),
					{ expirationTtl: 30 * 24 * 60 * 60 }
				);

				const baseUrl = "https://authentic.readtalk.workers.dev";
				return Response.redirect(
					`${baseUrl}/settings?session=${sessionId}`,
					302
				);
			},
		}).fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;

async function getOrCreateUser(env: Env, email: string): Promise<string> {
	const result = await env.AUTH_DB.prepare(
		`INSERT INTO user (email) VALUES (?)
		 ON CONFLICT (email) DO UPDATE SET email = email
		 RETURNING id;`
	).bind(email).first<{ id: string }>();
	if (!result) throw new Error(`Unable to process user: ${email}`);
	return result.id;
}
