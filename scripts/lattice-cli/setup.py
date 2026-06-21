"""Setup configuration for lattice-cli."""

from setuptools import setup, find_packages

setup(
    name="lattice-cli",
    version="0.1.0",
    description="Lattice OS CLI — manage Docker appliance deployments",
    author="JJEM Global Technology, Inc.",
    python_requires=">=3.10",
    packages=find_packages(),
    entry_points={
        "console_scripts": [
            "lattice=lattice_cli.main:main",
        ],
    },
    classifiers=[
        "Programming Language :: Python :: 3",
        "Operating System :: OS Independent",
        "Topic :: System :: Systems Administration",
    ],
    install_requires=[],  # Zero external deps — stdlib only
)
