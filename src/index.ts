import { issuer } from "@openauthjs/openauth";
import {
	CloudflareStorage,
	type CloudflareStorageOptions,
} from "@openauthjs/openauth/storage/cloudflare";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createSubjects } from "@openauthjs/openauth/subject";
import { object, string } from "valibot";
import { renderSettings } from "./settings";

const subjects = createSubjects({
	user: object({
		id: string(),
	}),
});

function readSessionCookie(request: Request): string {
	const cookie = request.headers.get("Cookie") ?? "";
	for (const part of cookie.split(";")) {
		const [k, ...v] = part.trim().split("=");
		if (k === "rt_session") return v.join("=");
	}
	return "";
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/settings") {
			const code = readSessionCookie(request);
			const value = code
				? await env.GLOBAL_KV.get("encryption:key" + code)
				: null;
			return new Response(renderSettings(code, value), {
				headers: { "content-type": "text/html" },
			});
		}

		if (url.pathname === "/logout" && request.method === "POST") {
			const code = readSessionCookie(request);
			if (code) {
				await env.GLOBAL_KV.delete("encryption:key" + code);
			}
			const headers = new Headers();
			headers.append(
				"Set-Cookie",
				"rt_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
			);
			headers.set("Location", "/");
			return new Response(null, { status: 302, headers });
		}

		if (url.pathname === "/") {
			url.searchParams.set("redirect_uri", url.origin + "/callback");
			url.searchParams.set("client_id", "your-client-id");
			url.searchParams.set("response_type", "code");
			url.pathname = "/authorize";
			return Response.redirect(url.toString());
		} else if (url.pathname === "/callback") {
			const code = url.searchParams.get("code") ?? "";
			const headers = new Headers();
			headers.append(
				"Set-Cookie",
				`rt_session=${code}; Path=/; HttpOnly; Secure; SameSite=Lax`,
			);
			headers.set("Location", "/settings");
			return new Response(null, { status: 302, headers });
		}

		return issuer({
			storage: CloudflareStorage({
				namespace: env.GLOBAL_KV as CloudflareStorageOptions["namespace"],
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
				title: "myAuth",
				primary: "#000000",
				favicon: "https://workers.cloudflare.com//favicon.ico",
				logo: {
					dark: "https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/db1e5c92-d3a6-4ea9-3e72-155844211f00/public",
					light:
						"https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/fa5a3023-7da9-466b-98a7-4ce01ee6c700/public",
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
	const result = await env.GLOBAL_DB.prepare(
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
