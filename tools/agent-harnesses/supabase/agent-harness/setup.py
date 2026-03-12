"""
setup.py — CLI-Anything: Supabase agent harness

Install:
    pip install -e .

Entry point:
    cli-anything-supabase
"""

from setuptools import find_namespace_packages, setup

setup(
    name="cli-anything-supabase",
    version="1.0.0",
    description="CLI-Anything agent harness for the Supabase CLI",
    author="JKlaw / CLI-Anything",
    python_requires=">=3.9",
    packages=find_namespace_packages(include=["cli_anything.*"]),
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
            "cli-anything-supabase = cli_anything.supabase.supabase_cli:cli",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Environment :: Console",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Topic :: Database",
        "Topic :: Software Development :: Libraries :: Application Frameworks",
    ],
)
