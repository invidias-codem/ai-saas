"""Firebase CLI harness core command groups."""
from .apps import apps_group
from .deploy import deploy_group
from .emulators import emulators_group
from .firestore import firestore_group
from .functions import functions_group
from .hosting import hosting_group
from .projects import projects_group

__all__ = [
    "apps_group",
    "deploy_group",
    "emulators_group",
    "firestore_group",
    "functions_group",
    "hosting_group",
    "projects_group",
]
