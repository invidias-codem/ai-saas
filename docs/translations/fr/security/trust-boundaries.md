# Frontières de Confiance

## Objectif

Ce document explique les principales frontières de confiance dans Genie AI / `ai-saas`.

Il existe car la plateforme n'est pas une application à surface unique. Elle inclut :
- routes publiques landing et informatives
- routes produit authentifiées
- routes API
- jobs cron/automation
- intégrations et webhooks
- surfaces de développement local et opérationnelles

Quand ces surfaces ne sont pas clairement séparées, le système devient plus difficile à sécuriser, plus difficile à raisonner, et plus facile à casser accidentellement.

Ce document décrit le modèle de confiance actuel à un niveau architectural pratique.

---

## Principe Fondamental

Toutes les surfaces de l'application ne devraient pas être confiées équitablement.

Une architecture saine distingue entre :
- qui est autorisé à accéder à une surface
- ce que cette surface est autorisée à faire
- quelles suppositions le backend est autorisé à faire sur l'appelant

Les frontières de confiance ne sont pas seulement une question d'authentification. Elles concernent aussi :
- droits d'exécution
- exposition de données
- autorité opérationnelle
- privilèges d'intégration
- suppositions système-à-système

---

## Zones de Confiance Primaires

Genie AI devrait être compris comme opérant à travers plusieurs zones de confiance majeures.

## 1. Zone Visiteur Public

### Qui cela inclut
- visiteurs web non authentifiés
- lecteurs publics de surfaces style landing/support/blog/docs/privacy

### Ce que cette zone devrait accéder
- pages marketing publiques
- documentation publique
- contenu public support et politique
- flux d'entrée explicitement publics comme sign-in/sign-up

### Ce que cette zone NE devrait PAS accéder
- données utilisateur authentifiées
- routes produit protégées
- comportement API privé
- surfaces de mutation qui supposent identité utilisateur

### Risque clé
Une page qui a l'air publique peut encore être bloquée ou mal routée si le route gating n'est pas configuré correctement.

---

## 2. Zone Utilisateur Authentifié

### Qui cela inclut
- utilisateurs finaux connectés utilisant le produit intentionnellement via routes produit supportées

### Ce que cette zone devrait accéder
- surfaces workspace et conversation
- settings utilisateur
- APIs authentifiées
- fonctionnalités produit scopées à leur identité et permissions

### Ce que cette zone NE devrait PAS accéder automatiquement
- comportement admin interne sans restrictions
- privilèges d'automatisation backend-only
- état d'autres utilisateurs par défaut
- secrets d'intégration ou outils système privilégiés

### Note clé
L'authentification est nécessaire mais pas suffisante. Le système devrait toujours respecter les frontières au niveau feature et données dans l'utilisation authentifiée.

---

## 3. Zone Application Backend

### Qui cela inclut
- route handlers côté serveur
- logique produit interne
- paths d'exécution backend de confiance

### Ce que cette zone peut faire
- résoudre comportement runtime
- accéder configuration de confiance
- appeler fournisseurs utilisant credentials server-side
- écrire état protégé quand approprié
- médier entre requêtes UI et systèmes persistance/integration

### Pourquoi ça importe
La couche application backend est une frontière de confiance car elle a plus d'autorité qu'un client public. Elle ne devrait pas simplement miroiter les requêtes client aveuglément.

---

## 4. Zone Automatisation / Cron

### Qui cela inclut
- scheduled jobs
- flux automation background
- task runners frappant routes API internes

### Ce que cette zone peut faire
- exécuter workflows maintenance/update
- effectuer comportement intégration programmé
- accéder routes automation privilégiées où explicitement intentionné

### Pourquoi ça importe
Routes automation sont souvent publiques en termes de transport (doivent être reachable), mais elles ne sont pas "publiques" au sens normal de confiance utilisateur.

Elles requièrent :
- scope étroit
- vérification forte
- intent opérationnel clair

### Risque clé
Une route étant externement reachable pour raisons cron/webhook ne signifie pas qu'elle doit se comporter comme un endpoint public ordinaire.

---

## 5. Zone Intégration / Webhook

### Qui cela inclut
- callbacks Slack
- webhooks Telegram
- fournisseurs externes ou callbacks plateforme
- autres sources événements third-party

### Ce que cette zone devrait être confiée pour
- seulement le comportement spécifique validé pour cette intégration

### Ce qu'elle NE devrait PAS être confiée pour par défaut
- actions produit arbitraires
- mutation état interne sans restrictions
- équivalence large utilisateur authentifié

### Pourquoi ça importe
Callbacks externes peuvent être légitimes mais encore non fiables jusqu'à validation via :
- signing secrets
- verification tokens
- checks route-specific
- validation payload

---

## 6. Zone Données / Persistance

### Qui cela inclut
- état produit backed par base de données
- systèmes persistance structurés
- comportement application backed par schema

### Fonction frontière confiance
La couche persistance devrait distinguer entre :
- données lisibles publiquement
- données utilisateur authentifiées
- état système interne
- paths mutation automation-only ou admin-only

### Pourquoi ça importe
Une ligne base de données existante n'implique pas que chaque surface app devrait être autorisée à la lire ou muter.

C'est surtout important quand l'architecture produit évolue plus vite que la clarté de policy.

---

## 7. Modèle de Scoping : Users, Workspaces, Documents, et Retrieval

Beaucoup d'échecs qui ressemblent à "AI bugs" sont en réalité des bugs de scoping ou frontières confiance.

Les couches scoping les plus importantes sont :

### Frontière Utilisateur
Un workspace manquant ne signifie pas scope manquant.
Documents personnels et conversations personnelles appartiennent encore à une frontière utilisateur et ne doivent jamais être traités comme globalement unscoped.

### Frontière Workspace
Quand un workspace existe, c'est le scope collaboratif/projet primaire pour :
- documents
- conversations
- retrieval
- assemblage mémoire/contexte

Un document attaché à Workspace A ne devrait pas influencer silencieusement Workspace B.

### Frontière Document
Documents sont des objets scoped first-class, pas juste pièces jointes chat transitoires.
Un document peut être :
- personnel
- workspace-scoped
- warm
- compressing
- cold

Chat devrait référencer identité document ou chunks récupérés, pas transporter répétitivement corps document bruts.

### Frontière Retrieval
Requêtes retrieval devraient utiliser le scope pertinent le plus étroit disponible.
Anchors scope préférées sont :
1. IDs document explicites
2. workspace ID quand présent
3. ownership utilisateur quand workspace absent

Deux modes d'échec importent ici :
- **over-scoping** : contexte valide sauté car champ scope absent
- **under-scoping** : documents non liés fuient dans résultats car scope trop large

### Frontière Preview
Preview est un path direct read/hydration document, pas la même chose que retrieval.
Preview devrait valider :
- auth
- identité document
- droits accès user/workspace

Une route preview ne devrait pas requérir workspace si le document est légitimement personnel.

### Frontière Runtime/Provider
Différences infrastructure ou provider ne doivent pas changer silencieusement le sens de scope user/workspace/document.
Que Lattice tourne avec différents modèles, storage, ou backends retrieval, les sémantiques scoping devraient rester stables.

---

## 8. Zone Développement Local / Opérateur

### Qui cela inclut
- développeurs avec accès repo local
- scripts et tooling local
- surfaces operateur/debug
- état environnement machine-local

### Pourquoi ça importe
L'accès local est hautement privilégié, mais c'est aussi un des endroits les plus faciles pour confusion vérité et fuite accidentelle.

### Risques dans cette zone
- drift local confondu avec source truth
- mishandling secrets/config
- fixes local-only assumés représentant comportement production
- suppositions build ou schema inférées depuis machine state unhealthy

C'est une zone de confiance car actions operateur dépassent souvent dramatiquement permissions normales application.

---

## 9. Zone Terminal / Raw SSE + Local Sandbox

### Qui cela inclut
- clients CLI et shell loops locaux
- automation machine-local appelant `/api/cli/stream` et `/api/memory/cli`
- comportement approval-matrix local dans `~/.lattice/settings`

### Pourquoi ça importe
Cette zone est techniquement remote-backed mais autorité est split entre :
- la server stream API
- décisions confiance client local
- exécution user-gated dans shell loop

Ce n'est pas public, et ce n'est pas équivalent à usage normal produit authentifié.

### Règles dans cette zone
- `/api/cli/stream` et `/api/memory/cli` requièrent bearer-token auth quand `LATTICE_CLI_TOKEN` configuré
- modes approval local affectent autorité exécution, pas server trust
- bearer tokens ne doivent pas être traités comme credentials anonymes ou publics
- couches proxy ou transport ne doivent pas exposer ces routes comme public par omission

---

## Types de Frontières

Les frontières confiance dans ce système apparaissent en formes multiples.

## A. Frontière Route
Si une route est publique, authentifiée, ou restreinte.

## B. Frontière Données
Si une surface peut lire ou muter certaines classes d'état.

## C. Frontière Exécution
Si un caller peut trigger logique haute autorité.

## D. Frontière Intégration
Si un système externe est autorisé à invoquer callback étroit ou surface action plus large.

## E. Frontière Opérationnelle
Si un acteur local ou backend est traité comme surface développement/operateur plutôt que surface utilisateur normal.

---

## Public vs Protected N'est Pas Toute L'Histoire

Une erreur commune est de collapser tout thinking sécurité en binaire :
- public
- authenticated

Ce n'est pas assez pour cette plateforme.

Par exemple :
- une route cron peut être transport-public mais opérationnellement privilégiée
- un user signed-in est authentifié mais ne devrait pas automatiquement gagner pouvoir type-admin
- un endpoint webhook peut être reachable mais seulement valide pour un comportement intégration étroit

Les frontières confiance doivent refléter ces distinctions.

---

## Exemples de Discipline Frontières en Pratique

## Exemple 1 — Route Docs Publique
Une route docs peut être publique en intention UI, mais sauf si le auth gate la traite comme publique, utilisateurs non authentifiés sont bounced.

### Leçon
Public-route intent doit matcher actual route gating.

---

## Exemple 2 — APIs Produit Authentifiées
Un user signed-in peut utiliser APIs produit, mais ça ne signifie pas que le serveur devrait accepter chaque claim client comme autoritatif.

### Leçon
Le backend doit encore résoudre comportement réel en utilisant contexte de confiance.

---

## Exemple 3 — Routes Cron ou Webhook
Une route peut être externement callable tout en appartenant à une frontière automation privilégiée.

### Leçon
Reachability n'est pas la même chose que confiance large.

---

## Exemple 4 — Présence Schema Base de Données
Une table existant dans le repo ou base de données locale ne signifie pas que le système production devrait assumer qu'elle existe partout ou que chaque caller devrait être autorisé à l'utiliser.

### Leçon
Schema truth et access policy sont des concerns séparés.

---

## Échecs Frontières Communs à Éviter

## 1. UI Intent Without Backend Enforcement
Une page a l'air publique mais est encore protégée par middleware.

## 2. Client Assertions Treated as Trusted Truth
Le frontend claim un mode, état, ou décision que le backend devrait vraiment résoudre lui-même.

## 3. Overbroad Callback Trust
Une route intégration/webhook accepte plus autorité que son purpose étroit requiert.

## 4. Authenticated Equals Admin Drift
Users signed-in traités comme s'ils devraient automatiquement accéder logique interne ou privilégiée.

## 5. Local Operator Confusion
Comportement environnement local confondu avec réalité production ou architecture canonique.

---

## Checklist Revue Frontières

En ajoutant une nouvelle route, feature, ou intégration, demander :

1. Quelle zone confiance est le caller dans ?
2. Quelle est l'autorité minimum cette surface needs ?
3. Quel state est readable depuis ce path ?
4. Quel state est writable depuis ce path ?
5. Quelles suppositions le backend fait sur le caller ?
6. Est-ce une route publique, route authentifiée, route backend privilégiée, ou route intégration étroite ?
7. Si la route est externement reachable, est-elle encore étroitement bounded en comportement ?

---

## Relation avec Autres Docs

Ce document devrait être lu avec :
- `docs/security/public-routes.md`
- `docs/architecture/system-architecture.md`
- `docs/operations/truth-surfaces.md`
- future API et trust/reference documentation

La documentation routes publiques explique **visibilité**.
Ce document trust-boundary explique **autorité**.

---

## Résumé

L'idée sécurité la plus importante pour ce codebase est celle-ci :

**Ne traitez pas toutes les surfaces reachable, utilisateurs authentifiés, ou callbacks externes comme également fiables.**

Genie AI est une plateforme multi-surface, et sa sécurité dépend de garder ces surfaces lisibles, étroites, et appropriément bounded.