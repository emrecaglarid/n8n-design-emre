import { OperationalError } from 'n8n-workflow';

/**
 * Talks to the AI gym admin API (plain HTTP on loopback). Prototype only:
 * the gym holds the temporary copies of the apps that test chats use.
 */
export class GymAdminClient {
	constructor(
		private readonly baseUrl: string,
		private readonly harnessToken: string,
	) {}

	private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
		let res: Response;
		try {
			res = await fetch(`${this.baseUrl}${path}`, {
				method,
				headers: {
					authorization: `Bearer ${this.harnessToken}`,
					'content-type': 'application/json',
				},
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(20_000),
			});
		} catch (error) {
			throw new OperationalError('The test copy service is not reachable', { cause: error });
		}
		const text = await res.text();
		if (!res.ok) {
			throw new OperationalError(`Test copy service error ${res.status} on ${method} ${path}`, {
				extra: { body: text.slice(0, 500) },
			});
		}
		return (text ? JSON.parse(text) : {}) as T;
	}

	async exportSnapshot(tenant: string): Promise<GymSnapshot> {
		return await this.call<GymSnapshot>('GET', `/_gym/v1/tenants/${tenant}/snapshot`);
	}

	async importSnapshot(tenant: string, snapshot: GymSnapshot): Promise<void> {
		await this.call('PUT', `/_gym/v1/tenants/${tenant}/snapshot`, snapshot);
	}

	async deleteTenant(tenant: string): Promise<void> {
		await this.call('DELETE', `/_sim/v1/tenants/${tenant}`);
	}

	async issueCredential(
		tenant: string,
		service: string,
		account: string,
		credential?: string,
	): Promise<{ type: string; data: Record<string, unknown> } | undefined> {
		const res = await this.call<{ credential?: { type: string; data: Record<string, unknown> } }>(
			'POST',
			`/_sim/v1/tenants/${tenant}/credentials`,
			{ account, service, ...(credential ? { credential } : {}) },
		);
		return res.credential;
	}

	async getTenant(tenant: string): Promise<{
		n8n_credentials?: Record<string, Record<string, unknown>>;
	}> {
		return await this.call('GET', `/_sim/v1/tenants/${tenant}`);
	}

	async getState<T>(tenant: string, service: string): Promise<T> {
		return await this.call<T>('GET', `/_sim/v1/tenants/${tenant}/state?service=${service}`);
	}

	/** Things that happen in an app, done by someone other than the agent (a person posts a message). */
	async postEvents(
		tenant: string,
		events: Array<{ service: string; type: string; params: Record<string, unknown> }>,
	): Promise<Array<Record<string, unknown>>> {
		const res = await this.call<{ results?: Array<Record<string, unknown>> }>(
			'POST',
			`/_sim/v1/tenants/${tenant}/events`,
			events,
		);
		return res.results ?? [];
	}
}

export interface GymSnapshot {
	format: string;
	tenant: string;
	meta: { admin_token?: string; services?: string[]; [key: string]: unknown };
	creds: unknown[];
	events: unknown[];
	[key: string]: unknown;
}
