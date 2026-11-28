"""Setup configuration for lattice-cli."""

from setuptools import setup, find_packages
from lattice_cli import __version__

setup(
    name="lattice-cli",
    version=__version__,
    description="Lattice OS CLI — manage Docker appliance deployments",
    author="JJEM Global Technology, Inc.",
    python_requires=">=3.11",
    packages=find_packages(),
    entry_points={
        "console_scripts": [
            "lattice=lattice_cli.main:main",
        ],
    },
    install_requires=[
        "cryptography==50.0.2",  # ed25519 V3 license verification
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "Operating System :: OS Independent",
        "Topic :: System :: Systems Administration",
    ],
)
