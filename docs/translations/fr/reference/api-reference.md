# Référence de l'API

## Objectif

Ce document fournit une référence pratique pour les surfaces importantes de l'API Genie AI.

Il n'est pas destiné à remplacer un OpenAPI généré. Au lieu de cela, c'est une référence opérationnelle lisible par les humains pour :
- développeurs
- mainteneurs
- collaborateurs
- réviseurs

L'accent est mis sur la clarté :
- ce que fait la route
- si elle est publique ou protégée
- quelles entrées et sorties sont importantes
- quels effets secondaires attendre
- quelle surface de vérité utiliser lors du débogage

---

## Modèle de Classification des Routes

Cette référence utilise les catégories de routes suivantes :

### Publique
Accessible sans authentification utilisateur normale, généralement parce que la route supporte l'UX publique ou l'intégration externe.

### Protégée
Requiert un contexte d'utilisateur authentifié.

### Intégration / Callback
Accessible externement pour un but d'intégration étroit. L'accessibilité n'implique pas une confiance large.

### Automatisation / Cron
Utilisée par des workflows programmés ou en arrière-plan.

### Terminal / SSE Brut
Flux bruts Server-Sent Events destinés aux outils CLI, intégrations, et clients non-navigateur. Ces routes omettent les enveloppes JSON typiques et requièrent des parseurs de client explicites.

---

## APIs de Produit Central

## `POST /api/chat`

- Catégorie : Protégée
- Objectif : Route d'exécution de chat principale.
- Responsabilités : recevoir les requêtes de chat, résoudre le contexte de conversation et workspace, exécuter le flux provider/model, retourner les métadonnées de réponse de l'assistant.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de runtime en direct, vérité de code source.

---

## `GET /api/conversations`
## `POST /api/conversations`

- Catégorie : Protégée
- Objectif : Gérer l'état de collection de conversations pour les utilisateurs authentifiés.
- Responsabilités : lister ou créer des conversations, supporter le routing workspace-aware.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de base de données/schéma.

---

## `POST /api/conversations/new`

- Catégorie : Protégée
- Objectif : Créer un point d'entrée de flux de nouvelle conversation.
- Responsabilités : initialiser une nouvelle conversation et l'état UI attendu.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de base de données/schéma, vérité frontend/runtime.

---

## `GET /api/conversations/[id]`
## `PATCH /api/conversations/[id]`
## `DELETE /api/conversations/[id]`

- Catégorie : Protégée
- Objectif : Récupérer, mettre à jour, ou supprimer une conversation spécifique.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de base de données/schéma, vérité de runtime en direct.

---

## `GET /api/workspaces`
## `POST /api/workspaces`

- Catégorie : Protégée
- Objectif : Gérer les enregistrements de workspace.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de base de données/schéma.

---

## `GET /api/workspaces/default`

- Catégorie : Protégée
- Objectif : Résoudre le workspace par défaut pour l'utilisateur actuel.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de base de données/schéma, vérité de runtime en direct.

---

## `GET /api/operating-profiles`
## `POST /api/operating-profiles`

- Catégorie : Protégée
- Objectif : Gérer les enregistrements d'operating-profile.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de base de données/schéma.

---

## `GET /api/operating-profiles/default`

- Catégorie : Protégée
- Objectif : Résoudre le operating profile par défaut pour le contexte/utilisateur actuel.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de base de données/schéma.

---

## `POST /api/onboarding/complete`

- Catégorie : Protégée
- Objectif : Finaliser l'onboarding et créer/attacher l'état de produit requis.
- Classe de risque connue : hautement sensible à la vérité de schéma.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de base de données/schéma, vérité de runtime en direct.

---

## APIs Terminal / SSE Brut

## `POST /api/cli/stream`

- Catégorie : Terminal / Raw SSE
- Objectif : Diffuser les réponses de l'assistant et enveloppes de contrôle d'exécution locale pour consommateurs terminal-natifs. Cette route est le pont entre le runtime de l'app web et clients CLI shell-driven.
- Auth : bearer token quand `LATTICE_CLI_TOKEN` est configuré ; sinon non authentifié dans les setups locaux.
- Request `Content-Type` : `application/json`
- Response `Content-Type` : `text/event-stream`
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de moteur de conversation, logs de shim CLI local.

### Forme de Request

```json
{
  "messages": [
    {
      "role": "user",
      "text": "list files in the current project"
    }
  ],
  "options": {
    "localMode": true,
    "memoryPlan": null,
    "sudoPromptNames": ["BashSafety", "CLIStreamer", "ToolRouter"]
  }
}
```

### Exemple cURL

```bash
curl -N -X POST http://localhost:3000/api/cli/stream \
  -H "Content-Type: application/json" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTICE_CLI_TOKEN" \
  -d '{"messages":[{"role":"user","text":"list files"}],"options":{"localMode":true}}'
```

### Notes

- Les événements sont des frames SSE avec framing line-buffered.
- Enveloppes de contrôle d'exécution locale arrivent comme JSON dans les lignes `data:`.
- La complétion finale est signalée par un frame de contrôle event-name plutôt que par HTTP close seul.
- Voir `docs/reference/cli-stream-sse.md` pour taxonomie exacte d'événements et règles de parsing.

---

## `GET /api/memory/cli`

- Catégorie : Terminal / Raw SSE API
- Objectif : Lire et écrire des entrées de mémoire CLI via une interface protégée par token.
- Auth : Même modèle bearer que `/api/cli/stream`.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de service de mémoire, vérité de vector store.

### Exemple cURL

```bash
curl -sS "http://localhost:3000/api/memory/cli?limit=20" \
  -H "x-lattice-user-id: local-dev" \
  -H "Authorization: Bearer $LATTICE_CLI_TOKEN"
```

### Notes

- Utilisez ceci pour inspecter les lectures/écritures de mémoire CLI sans le path complet du dashboard.
- Écritures de mémoire de shim local routent via cette API dans les flux CLI-enabled.

---

## APIs de Feedback et Support

## `POST /api/feedback`

- Catégorie : Protégée
- Objectif : Soumettre du feedback.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de transport downstream.

## `POST /api/support`

- Catégorie : Protégée
- Objectif : Soumettre des messages de support.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de transport downstream.

## `POST /api/guest-chat`

- Catégorie : Publique
- Objectif : Surface de chat invité publique.
- Classe de risque connue : surveiller l'exposition aux abus et la clarté du scope.
- Surface de vérité pour le débogage : vérité de runtime d'API, vérité de routing de mode runtime.

---

## Guide d'Envelope d'Erreur

De nombreuses routes retournent des enveloppes d'erreur JSON. La forme exacte peut ne pas être totalement standardisée encore.

```json
{
  "error": "Unauthorized"
}
```

```json
{
  "status": "error",
  "error_code": "unauthorized",
  "message": "You must be signed in to access this resource."
}
```

Là où des différences persistent, documenter le comportement explicite de route dans cette référence selon les besoins.