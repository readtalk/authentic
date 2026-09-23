/** @jsxImportSource hono/jsx */

import { issuer } from "@openauthjs/openauth";
import {
	CloudflareStorage,
	type CloudflareStorageOptions,
} from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { renderToString } from "hono/jsx/dom/server";

const subjects = createSubjects({
	user: object({ id: string() }),
});

function Settings() {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<title>READTalk Messenger</title>
				<style>{`
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
					.logout-btn {
						background: #000000;
						color: white;
						border: none;
						padding: 10px 24px;
						border-radius: 8px;
						font-size: 1rem;
						cursor: pointer;
						text-decoration: none;
						display: inline-block;
					}
					.logout-btn:hover { background: #1a1a1a; }
				`}</style>
			</head>
			<body>
				<div class="card">
					<h1>Settings</h1>
					<a href="/logout" class="logout-btn">Logout</a>
				</div>
			</body>
		</html>
	);
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/settings") {
			return new Response(renderToString(<Settings />), {
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
				title: "myAuth",
				primary: "#000000",
				favicon: "https://workers.cloudflare.com//favicon.ico",
				logo: {
					dark: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/db1e5c92-d3a6-4ea9-3e72-155844211f00/public",
					light: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fa5a3023-7da9-466b-98a7-4ce01ee6c700/public",
				},
			},
			success: async (ctx, value) => {
				return ctx.subject("user", {
					id: await getOrCreateUser(env, value.email),
				});
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
	console.log(`Found or created user ${result.id} with email ${email}`);
	return result.id;
}
