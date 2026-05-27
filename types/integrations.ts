export interface IntegrationMetadata {
    [key: string]: any;
}

export interface GitHubLinkedAccount {
    lattice_user_id: string;
    github_user_id: string;
    github_login: string;
    github_email?: string | null;
    scopes: string[];
    isConnected: boolean;
    createdAt: Date;
    updatedAt: Date;
}
