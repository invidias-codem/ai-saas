# Liste des vérifications préalables et tests de fonctionnement pour l'auto-hébergement

## Objectif

Définir les vérifications préalables et les tests de fonctionnement des déploiements Lattice auto-hébergés en entreprise.

Ce document répond à une question pratique :

## « Comment savoir si une nouvelle installation est réellement utilisable ? »

Il doit être utilisé pour :
- les premières installations en entreprise
- la validation des déploiements
- la validation des mises à niveau
- le tri et le diagnostic des incidents de support

---

## Deux niveaux de validation

### Niveau 1 — Vérifications préalables
Vérifier la configuration et la connectivité des services avant leur utilisation normale.

Exemples :
- les variables d'environnement sont présentes
- la base de données est accessible
- le stockage est accessible
- l'authentification est configurée
- les secrets nécessaires sont présents

### Niveau 2 — Test de fonctionnement
Vérifier que les parcours réels des utilisateurs fonctionnent.

Exemples :
- la connexion est possible
- un espace de travail peut être créé ou ouvert
- un document peut être téléversé
- un document peut être prévisualisé
- une requête fondée sur un document peut être posée

Les deux niveaux sont nécessaires pour valider une installation d'entreprise en confiance.

---

## Liste des vérifications préalables — Mode A de référence

### Configuration principale de l'application
- [ ] `NEXT_PUBLIC_APP_URL` est correctement définie
- [ ] `NODE_ENV` est définie de manière appropriée
- [ ] les secrets d'application requis sont présents
- [ ] les secrets internes des tâches planifiées/routes sont configurés

### Authentification
- [ ] la configuration du fournisseur d'authentification est présente
- [ ] les URL de rappel/redirection correspondent à l'URL de déploiement
- [ ] un parcours de connexion de test fonctionne ou est correctement configuré

### Base de données
- [ ] l'URL ou la configuration de la base de données principale est présente
- [ ] les identifiants du rôle de service ou de l'administrateur sont présents si nécessaire
- [ ] la connexion à la base de données fonctionne depuis l'application
- [ ] les migrations ont été appliquées avec succès

### Stockage
- [ ] la configuration du bucket de stockage est présente
- [ ] l'application peut écrire dans le stockage
- [ ] l'application peut lire dans le stockage
- [ ] le téléversement signé fonctionne, s'il est utilisé

### Configuration des modèles/fournisseurs
- [ ] au moins un fournisseur compatible de chat/raisonnement est configuré
- [ ] au moins un fournisseur compatible d'embeddings est configuré
- [ ] le comportement de sélection et de repli des fournisseurs est compris

### Vérification des fonctions optionnelles
- [ ] les sous-systèmes optionnels désactivés ne sont pas requis pour l'installation de base
- [ ] l'absence de configuration d'intégrations optionnelles ne bloque pas les fonctions essentielles

---

## Liste des tests de fonctionnement — Mode A de référence

### 1. Démarrage de l'application
- [ ] l'application se charge à son URL publique
- [ ] les routes publiques s'affichent correctement
- [ ] l'interface authentifiée se charge après connexion

### 2. Authentification
- [ ] un utilisateur peut se connecter
- [ ] une session est établie
- [ ] l'accès aux surfaces authentifiées est autorisé

### 3. Espace de travail
- [ ] un espace de travail peut être créé ou ouvert
- [ ] les routes propres à l'espace de travail se chargent
- [ ] aucune boucle d'intégration ni erreur de configuration dupliquée ne bloque la première utilisation

### 4. Téléversement de documents
- [ ] un document TXT/MD/PDF peut être téléversé
- [ ] le téléversement se termine sans échec de transport
- [ ] une URI de stockage est créée et conservée
- [ ] le document apparaît dans l'interface de l'espace de travail

### 5. Prévisualisation de documents
- [ ] un document téléversé et déjà traité peut être prévisualisé
- [ ] l'aperçu renvoie un contenu extrait lisible
- [ ] le comportement des documents personnels et des documents d'espace de travail est compris et fonctionne, selon le cas

### 6. Requête fondée sur un document
- [ ] une question fondée sur un document peut être posée
- [ ] le modèle utilise le contenu du document téléversé, pas seulement les métadonnées du nom de fichier
- [ ] aucune incompatibilité RPC de récupération n'empêche l'injection du contexte

### 7. Mémoire et contexte de base
- [ ] l'assemblage du contexte s'exécute sans erreur fatale
- [ ] le contexte du document est inclus quand cela est attendu
- [ ] aucune fuite de portée entre les espaces de travail ou les documents n'est observée

### 8. Protection des API principales
- [ ] les routes internes/planifiées protégées refusent une authentification invalide
- [ ] les routes internes/planifiées protégées acceptent une authentification valide

---

## Scénario de test recommandé

Une installation d'entreprise de base doit pouvoir réussir ce scénario :

1. déployer l'application et la base de données
2. configurer l'authentification et le stockage
3. se connecter
4. créer ou ouvrir un espace de travail
5. téléverser un PDF
6. vérifier qu'il apparaît dans la liste des documents
7. prévisualiser le document
8. demander « Résume le document que je viens de téléverser »
9. recevoir une réponse ancrée dans le contenu réel du document

Si ce scénario échoue, l'installation ne peut pas encore être considérée comme prête.

---

## Classification des échecs

Lorsqu'une vérification préalable ou un test de fonctionnement échoue, classer clairement le problème.

### Échec de configuration
Exemples :
- variables d'environnement manquantes
- secret mal formé
- combinaison de fournisseurs non prise en charge

### Échec de dépendance
Exemples :
- base de données inaccessible
- stockage inaccessible
- URL de rappel d'authentification incorrecte

### Échec d'un parcours produit
Exemples :
- le téléversement réussit, mais l'aperçu échoue
- le document existe, mais le modèle ne peut pas l'analyser
- la création d'espace de travail boucle ou crée des doublons

### Échec de portée ou de frontière
Exemples :
- contexte du mauvais espace de travail
- récupération de documents personnels ignorée à tort
- l'aperçu exige workspaceId alors qu'il ne devrait pas

---

## Recommandation finale

Une installation d'entreprise ne doit être considérée comme saine que si elle réussit :
- les vérifications préalables de configuration
- la connectivité des dépendances
- les tests de fonctionnement de l'espace de travail, du téléversement, de la prévisualisation et des requêtes documentaires

C'est le niveau minimal requis pour un auto-hébergement d'entreprise fiable.
