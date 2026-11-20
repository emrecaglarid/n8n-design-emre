import type {
	ICredentialDataDecryptedObject,
	ICredentials,
	ICredentialsExpressionResolveValues,
	IExecuteData,
	IGetDecryptedCredentialsOptions,
	IHttpRequestHelper,
	IHttpRequestOptions,
	INode,
	INodeCredentialsDetails,
	INodeProperties,
	IRequestOptionsSimplified,
	IWorkflowExecuteAdditionalData,
	Workflow,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import { ICredentialsHelper, UserError } from 'n8n-workflow';

/**
 * Gives a tool in a test chat the credentials of its test copy instead of the
 * builder's own. A credential type that the copy does not have fails the
 * call, so a test never falls back to the real account. Token refreshes are
 * not written back, because the stored credential is the builder's.
 */
export class TestCopyCredentialsHelper extends ICredentialsHelper {
	constructor(
		private readonly inner: ICredentialsHelper,
		private readonly copyCredentials: ReadonlyMap<string, Record<string, unknown>>,
	) {
		super();
	}

	getParentTypes(name: string): string[] {
		return this.inner.getParentTypes(name);
	}

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		typeName: string,
		requestOptions: IHttpRequestOptions | IRequestOptionsSimplified,
		workflow: Workflow,
		node: INode,
	): Promise<IHttpRequestOptions> {
		return await this.inner.authenticate(credentials, typeName, requestOptions, workflow, node);
	}

	async preAuthentication(
		helpers: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
		typeName: string,
		node: INode,
		credentialsExpired: boolean,
	): Promise<ICredentialDataDecryptedObject | undefined> {
		return await this.inner.preAuthentication(
			helpers,
			credentials,
			typeName,
			node,
			credentialsExpired,
		);
	}

	async runPreAuthentication(
		helpers: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
		typeName: string,
	): Promise<ICredentialDataDecryptedObject | undefined> {
		return await this.inner.runPreAuthentication(helpers, credentials, typeName);
	}

	async getCredentials(
		nodeCredentials: INodeCredentialsDetails,
		type: string,
	): Promise<ICredentials> {
		return await this.inner.getCredentials(nodeCredentials, type);
	}

	async getDecrypted(
		additionalData: IWorkflowExecuteAdditionalData,
		nodeCredentials: INodeCredentialsDetails,
		type: string,
		mode: WorkflowExecuteMode,
		executeData?: IExecuteData,
		raw?: boolean,
		expressionResolveValues?: ICredentialsExpressionResolveValues,
		options?: IGetDecryptedCredentialsOptions,
	): Promise<ICredentialDataDecryptedObject> {
		const copy = this.copyCredentials.get(type);
		if (!copy) {
			throw new UserError(`This tool can't run in a test: the test copy has no ${type} account`);
		}
		// The stored credential gives the type's defaults (URLs, scopes). Every
		// secret that the copy issued replaces the stored one.
		const stored = await this.inner.getDecrypted(
			additionalData,
			nodeCredentials,
			type,
			mode,
			executeData,
			raw,
			expressionResolveValues,
			options,
		);
		return { ...stored, ...copy } as ICredentialDataDecryptedObject;
	}

	async updateCredentials(): Promise<void> {}

	async updateCredentialsOauthTokenData(): Promise<void> {}

	getCredentialsProperties(type: string): INodeProperties[] {
		return this.inner.getCredentialsProperties(type);
	}

	isCredentialUsableByNode(credentialType: string, nodeType: string): boolean {
		return this.inner.isCredentialUsableByNode(credentialType, nodeType);
	}
}
