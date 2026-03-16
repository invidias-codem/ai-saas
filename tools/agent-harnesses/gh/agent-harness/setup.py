"""
setup.py for cli-anything-gh

Install with: pip install -e .
Then run:     cli-anything-gh --help
"""

from setuptools import setup, find_packages

setup(
    name="cli-anything-gh",
    version="1.0.0",
    description="CLI-Anything agent harness for GitHub CLI (gh) — normalized JSON, REPL, agent-friendly",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="Invidious / JKlaw",
    url="https://github.com/invidias-codem/ai-saas",
    packages=find_packages(exclude=["tests", "tests.*"]),
    python_requires=">=3.9",
    install_requires=[
        "click>=8.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0",
            "pytest-cov",
        ],
    },
    entry_points={
        "console_scripts": [
            "cli-anything-gh = cli_anything.gh.gh_cli:cli",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Utilities",
    ],
    keywords="github cli agent harness automation json",
)
