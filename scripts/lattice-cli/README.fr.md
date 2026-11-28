# Lattice OS CLI

**0.3.1-rc.1 — version candidate ; la distribution stable n'est pas encore approuvée.**

La CLI gère les installations Docker de Lattice OS sur votre système d'exploitation. La page de téléchargement de l'application se trouve à `/downloads`. Les fichiers n'y figurent qu'après examen des preuves de compilation et de publication.

## Installation

Choisissez l'exécutable adapté à votre système et à votre processeur. Téléchargez `SHA256SUMS` et comparez les sommes de contrôle. Avant toute exécution, vérifiez la provenance de la compilation GitHub à l'aide du commit source complet indiqué sur la page de téléchargement :

```sh
gh attestation verify lattice-linux-amd64 --repo invidias-codem/ai-saas --signer-workflow invidias-codem/ai-saas/.github/workflows/build-lattice-cli.yml --source-ref refs/heads/main --source-digest <40-character-source-commit>
```

Vous pouvez aussi télécharger et examiner le fichier versionné `install.sh` ou `install.ps1`, vérifier sa somme de contrôle et sa provenance, puis l'exécuter en précisant la version et le commit source :

```sh
bash install.sh cli-v0.3.1-rc.1 <40-character-source-commit>
```

```powershell
.\install.ps1 -Version cli-v0.3.1-rc.1 -SourceCommit <40-character-source-commit>
```

Les installateurs nécessitent GitHub CLI et utilisent un répertoire appartenant à l'utilisateur, sans droits d'administrateur. Ajoutez-le au PATH si nécessaire. Aucun repli vers les sources n'est prévu. Les fichiers restent indisponibles jusqu'à la publication d'une version candidate.

## Vérifier l'installation

```sh
lattice --version
lattice doctor --offline --json
lattice doctor
```

Les binaires intègrent Python et des bibliothèques cryptographiques. Les commandes de déploiement nécessitent Docker Engine avec Compose v2 (ou Docker Desktop avec des conteneurs Linux). La vérification hors ligne valide la CLI, pas le déploiement complet.

## Commandes

Exécutez `lattice <group> --help` et `lattice <group> <command> --help` pour afficher les arguments.

| Groupe | Commandes |
| --- | --- |
| auth | login, logout, status; la génération historique de jetons n'est pas une autorité fiable pour les droits d'accès |
| deploy | init, start, stop, restart, status, shell |
| license | activate, deactivate, show |
| health | check, logs |
| upgrade | upgrade, rollback |
| backup | create, restore, list |
| org | status, members; l'intégration de l'authentification distante reste un obstacle à la publication stable |
| task | run; nécessite des identifiants d'API locaux ou de partenaire |
| doctor | --offline, --json |

Cette version candidate sert uniquement aux essais de développement dans un environnement jetable. Les problèmes connus de licence, d'authentification d'organisation, de gestion des identifiants et de sauvegarde sont suivis dans [l'état de préparation](../../docs/releases/cli-release-readiness.md). Ne l'utilisez pas pour une restauration en production ou pour faire appliquer des droits commerciaux.

## Compiler et tester à partir des sources

Utilisez Python 3.12 dans un environnement virtuel :

```sh
python -m pip install --require-hashes -r scripts/lattice-cli/requirements-build.lock
python -m unittest discover -s scripts/lattice-cli/tests -v
python scripts/lattice-cli/build.py --pyinstaller
python scripts/lattice-cli/smoke_binary.py dist/cli/lattice-linux-amd64
```

Compilez nativement pour chaque système et architecture. La matrice GitHub Actions couvre cinq cibles et ne prépare qu'une préversion brouillon. PyInstaller regroupe le bytecode Python sans en garantir la confidentialité. Les installations depuis les sources exigent Python 3.11+ et la dépendance de requirements.txt.
