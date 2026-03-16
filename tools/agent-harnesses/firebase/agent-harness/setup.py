"""Minimal setup.py for editable installs (pip install -e .)."""
from setuptools import find_packages, setup

setup(
    name="cli-anything-firebase",
    version="0.1.0",
    packages=find_packages(include=["cli_anything*"]),
    install_requires=[
        "click>=8.0",
        "prompt_toolkit>=3.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0",
            "pytest-cov",
        ]
    },
    entry_points={
        "console_scripts": [
            "cli-anything-firebase = cli_anything.firebase.firebase_cli:cli",
        ]
    },
    python_requires=">=3.9",
)
