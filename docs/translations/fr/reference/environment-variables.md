# Variables d'Environnement

## Objectif

Ce document décrit les principales variables d'environnement utilisées par Lattice OS / `ai-saas`.

Il vise à rendre la plateforme plus transparente pour :
- développeurs
- opérateurs
- réviseurs
- futurs mainteneurs

Ce n'est pas un déversement de secrets. C'est une référence pour ce qu'est chaque variable, quelle surface l'utilise, et si elle est destinée à l'exposition publique/navigateur ou à une utilisation server-side uniquement.

---

## Principe Important

Les variables d'environnement se divisent en deux grandes classes :

### Variables publiques
Les variables préfixées avec `NEXT_PUBLIC_` sont censées être exposées au code côté navigateur.
Elles ne doivent pas contenir de secrets.

### Variables serveur uniquement
Les variables sans `NEXT_PUBLIC_` doivent être traitées comme server-side uniquement sauf documentation explicite contraire.
Elles peuvent transporter des identifiants, tokens, ou configuration privilégiée.

---

## Note sur la Source de Vérité

Le schéma d'environnement typé le plus explicite dans le codebase actuel est :
- `lib/env.ts`

Ce document devrait suivre ce schéma, mais l'environnement de déploiement en direct doit toujours être vérifié séparément lors du débogage de problèmes de runtime réels.

---

## Guide du Mode de Déploiement

Lattice devrait être configuré de manière mode-aware plutôt que de requérir chaque sous-système optionnel dans chaque installation.

Opérationnellement, la configuration tombe dans ces classes larges :
- **core required** : valeurs nécessaires pour tout déploiement sérieux
- **mode-specific required** : valeurs requises seulement pour certains modes de déploiement
- **optional feature config** : valeurs qui activent des capacités avancées ou optionnelles

Pour l'histoire initiale self-hosted, la baseline devrait rester centrée sur :
- **Mode A — Standard Internal Deployment**

Cela signifie qu'une installation standard d'entreprise devrait prioriser la configuration pour :
- app/runtime
- authentification
- base de données
- stockage
- au moins un reasoning provider supporté
- au moins un embedding provider supporté

Elle ne devrait pas requérir chaque sous-système optionnel (agents sociaux, archival GPU, retrieval local avancé, etc.) à moins que ces capacités ne soient intentionnellement activées.

---

## Authentification / Clerk

## `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
### Type
- Publique

### Objectif
Clé publicable Clerk browser-safe utilisée pour initialiser les flux d'auth côté client.

### Utilisée pour
- intégration auth frontend
- UX sign-in/sign-up

---

## `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
### Type
- Publique

### Objectif
Configuration optionnelle de route de sign-in explicite pour Clerk.

---

## `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
### Type
- Publique

### Objectif
Configuration optionnelle de route de sign-up explicite pour Clerk.

---

## `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`
### Type
- Publique

### Objectif
Cible de redirect optionnelle post-sign-in.

---

## `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL`
### Type
- Publique

### Objectif
Cible de redirect optionnelle post-sign-out.

---

## `CLERK_SECRET_KEY`
### Type
- Serveur uniquement

### Objectif
Secret Clerk côté serveur utilisé pour opérations d'auth privilégiées.

### Note de sécurité
Ne doit jamais être traité comme browser-safe.

---

## `CLERK_WEBHOOK_SECRET`
### Type
- Serveur uniquement

### Objectif
Valide les appels webhook Clerk.

### Note de sécurité
Pertinente pour les trust boundaries des routes webhook.

---

## Variables Fournisseur AI / Modèle

## `GOOGLE_API_KEY`
### Type
- Serveur uniquement

### Objectif
Clé API pour accès fournisseur AI basé sur Google.

### Utilisée pour
- interactions modèle/fournisseur où la surface Google API est active

---

## `GOOGLE_PROJECT_ID`
### Type
- Serveur uniquement

### Objectif
Identifiant de projet Google Cloud.

### Utilisée pour
- services Google Cloud / Vertex-style où applicable

---

## `GOOGLE_LOCATION`
### Type
- Configuration serveur uniquement

### Objectif
Configuration région/localisation Google.

### Default dans le schéma
- `us-central1`

---

## `GCP_SERVICE_ACCOUNT_KEY_JSON`
### Type
- Secret serveur uniquement

### Objectif
JSON brut de service-account utilisé pour accès privilégié Google Cloud API.

### Note de sécurité
Hautement sensible.
Doit être traité comme credential serveur portant des secrets.

---

## `REPLICATE_API_TOKEN`
### Type
- Serveur uniquement

### Objectif
Token fournisseur Replicate pour chemins de génération model-backed.

---

## `REPLICATE_API_TOKEN_MUSIC`
### Type
- Serveur uniquement

### Objectif
Token/configuration Replicate pour flux de génération liés à la musique.

---

## `REPLICATE_API_TOKEN_VIDEO`
### Type
- Serveur uniquement

### Objectif
Token/configuration Replicate pour flux de génération liés à la vidéo.

---

## Variables RAG / Retrieval / Memory

## `NEXT_PUBLIC_RAG_ENABLED`
### Type
- Flag de configuration publique

### Objectif
Contrôle si le comportement lié RAG/mémoire est considéré activé au niveau config client-facing.

### Default dans le schéma
- `true`

### Note
Les flags de configuration publique ne sont pas des frontières de sécurité. Ils ne doivent pas être traités comme preuve qu'une fonctionnalité backend est sûre ou non.

---

## `RAG_CLOUD_FUNCTION_URL`
### Type
- Configuration côté serveur

### Objectif
Endpoint/surface de configuration pour comportement RAG backed par cloud-function.

---

## `RAG_MEMORY_RETENTION_DAYS`
### Type
- Configuration côté serveur

### Objectif
Configuration fenêtre de rétention pour comportement lié à la mémoire.

### Default dans le schéma
- `90`

---

## `RAG_RETRIEVAL_LIMIT`
### Type
- Configuration côté serveur

### Objectif
Contrôle count/limit de retrieval pour retrieval de contexte lié RAG.

### Default dans le schéma
- `5`

---

## `RAG_SIMILARITY_THRESHOLD`
### Type
- Configuration côté serveur

### Objectif
Contrôle seuil de similarité pour logique de retrieval.

### Default dans le schéma
- `0.6`

---

## Variables Supabase / Persistance

## `NEXT_PUBLIC_SUPABASE_URL`
### Type
- Publique

### Objectif
URL projet Supabase browser-safe utilisée par intégration client-side ou shared runtime.

---

## `NEXT_PUBLIC_SUPABASE_ANON_KEY`
### Type
- Publique

### Objectif
Clé anon Supabase browser-safe pour patterns d'accès client-side permis.

### Note de sécurité
Public ne signifie pas sans restrictions. Les politiques backend/base de données doivent encore enforcer de vraies frontières d'accès.

---

## `SUPABASE_SERVICE_ROLE_KEY`
### Type
- Secret serveur uniquement

### Objectif
Credential privilégié service-role Supabase.

### Note de sécurité
Ne doit jamais être exposé au code côté navigateur.
C'est l'une des credentials d'application de plus haute sensibilité.

---

## Variables Intégration Slack

## `SLACK_BOT_TOKEN`
### Type
- Secret serveur uniquement

### Objectif
Token bot Slack pour comportement d'intégration Slack côté serveur.

---

## `SLACK_SIGNING_SECRET`
### Type
- Secret serveur uniquement

### Objectif
Valide l'authenticité callback/événement Slack.

---

## `SLACK_APP_ID`
### Type
- Configuration côté serveur

### Objectif
Identifiant application Slack.

---

## `SLACK_CLIENT_ID`
### Type
- Configuration côté serveur

### Objectif
Slack OAuth client id pour flux d'intégration backend.

---

## `SLACK_CLIENT_SECRET`
### Type
- Secret serveur uniquement

### Objectif
Slack OAuth client secret.

---

## `NEXT_PUBLIC_SLACK_CLIENT_ID`
### Type
- Publique

### Objectif
Support intégration Slack client-facing, comme flux Add to Slack.

---

## Variables Intégration Zapier

## `ZAPIER_CLIENT_ID`
### Type
- Configuration côté serveur

### Objectif
Identifiant client intégration Zapier.

---

## `ZAPIER_CLIENT_SECRET`
### Type
- Secret serveur uniquement

### Objectif
Secret intégration Zapier.

---

## `ZAPIER_API_KEY`
### Type
- Secret/configuration serveur uniquement

### Objectif
Accès API intégration Zapier.

---

## Variables GitHub / Agent / Automatisation Interne

## `GITHUB_AGENT_TOKEN`
### Type
- Secret serveur uniquement

### Objectif
Token GitHub pour flux d'agent autonomes ou assistés internes, comme automatisation de repo.

---

## `GITHUB_REPO_OWNER`
### Type
- Configuration côté serveur

### Objectif
Contexte owner de repo GitHub par défaut pour automatisation interne.

---

## `GITHUB_REPO_NAME`
### Type
- Configuration côté serveur

### Objectif
Contexte nom de repo GitHub par défaut pour automatisation interne.

---

## `GITHUB_DEFAULT_BRANCH`
### Type
- Configuration côté serveur

### Objectif
Nom de branche par défaut utilisé par flux d'automatisation GitHub internes.

### Default dans le schéma
- `main`

---

## Variables Webhooks / Cron / Jobs Internes

## `VERCEL_LOG_WEBHOOK_SECRET`
### Type
- Secret serveur uniquement

### Objectif
Protège la gestion de webhook logs Vercel.

---

## `CRON_SECRET`
### Type
- Secret serveur uniquement

### Objectif
Authentifie l'exécution de routes déclenchées par cron où scheduling secret-gated est requis.

### Note de sécurité
Ceci est particulièrement important car certaines routes cron peuvent être externement atteignables mais ne doivent pas se comporter comme des endpoints publics ordinaires.

---

## Guide d'Usage Général

## Utiliser `NEXT_PUBLIC_` seulement quand nécessaire
Tout ce qui est préfixé `NEXT_PUBLIC_` devrait être supposé visible au code client-side.

## Préférer l'accès typé via `lib/env.ts`
Le schéma typé aide à documenter l'intention et attrape les valeurs manquantes plus clairement que l'accès `process.env` brut dispersé.

## Ne pas confondre présence avec correction
Une variable existant dans un fichier `.env` local ne prouve pas :
- la production l'a
- la valeur est correcte
- le système en direct l'utilise comme attendu

La configuration d'environnement doit encore être vérifiée contre la surface de vérité de déploiement réelle.

---

## Guide de Sécurité

Les variables les plus sensibles dans cet ensemble incluent :
- `CLERK_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SLACK_SIGNING_SECRET`
- `SLACK_CLIENT_SECRET`
- `SLACK_BOT_TOKEN`
- `GCP_SERVICE_ACCOUNT_KEY_JSON`
- `REPLICATE_API_TOKEN*`
- `GITHUB_AGENT_TOKEN`
- `CRON_SECRET`
- `VERCEL_LOG_WEBHOOK_SECRET`

Elles ne devraient jamais être exposées dans le code client-side, captures d'écran, logs publics, ou config plaintext commité.

---

## Documents Connexes

Ce document devrait être lu avec :
- `docs/reference/api-reference.md`
- `docs/security/trust-boundaries.md`
- `docs/operations/truth-surfaces.md`
- futurs docs de configuration deployment/ops

---

## Amélioration de Suivi

Une future amélioration de cette référence serait d'ajouter :
- mapping variable → fichier/feature
- required/optional par environment (local, preview, production)
- exemples de setup pour développement local non-secret