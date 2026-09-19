import { issuer } from "@openauthjs/openauth";
import {
	CloudflareStorage,
	type CloudflareStorageOptions,
} from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { Hono } from "hono";
import { Settings } from "./settings";

const subjects = createSubjects({
	user: object({ id: string() }),
});

const app = new Hono();

app.get("/settings", (c) => {
	const userId = c.req.query("user_id") || "user_123";
	const email = c.req.query("email") || "user@example.com";
	return c.html(<Settings userId={userId} email={email} />);
});

app.get("/logout", (c) => {
	const response = c.redirect("/");
	response.headers.set("Set-Cookie", "session=; Max-Age=0; path=/");
	return response;
});

app.get("/", (c) => {
	const url = new URL(c.req.url);
	url.searchParams.set("redirect_uri", url.origin + "/settings");
	url.searchParams.set("client_id", "your-client-id");
	url.searchParams.set("response_type", "code");
	url.pathname = "/authorize";
	return c.redirect(url.toString());
});

app.get("/callback", (c) => {
	const url = new URL(c.req.url);
	return c.json({
		message: "OAuth flow complete!",
		params: Object.fromEntries(url.searchParams.entries()),
	});
});

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (
			url.pathname === "/settings" ||
			url.pathname === "/logout" ||
			url.pathname === "/" ||
			url.pathname === "/callback"
		) {
			return app.fetch(request, env, ctx);
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
				primary: "#FF0000",
				favicon: "https://raw.githubusercontent.com/readtalk/global/refs/heads/main/public/favicon.ico",
				logo: {
					dark: "https://raw.githubusercontent.com/readtalk/global/refs/heads/main/public/brand.png",
					light:
						"https://raw.githubusercontent.com/readtalk/global/refs/heads/main/public/brand.png",
				},
			},
			success: async (ctx, value) => {
				const userId = await getOrCreateUser(env, value.email);
				const baseUrl = "https://authentication.readtalk.workers.dev";
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
		`INSERT INTO user (email) VALUES (?)
		 ON CONFLICT (email) DO UPDATE SET email = email
		 RETURNING id;`
	)
		.bind(email)
		.first<{ id: string }>();
	if (!result) throw new Error(`Unable to process user: ${email}`);
	console.log(`Found or created user ${result.id} with email ${email}`);
	return result.id;
}
