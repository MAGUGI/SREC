#!/usr/bin/env python3
"""Checagem de ambiente para trabalhar no SREC na N2.

Verifica git, gh autenticado, Node 20, npm, Docker (instalado E com daemon
respondendo), Python 3 e permissao de push no fork igorSeberino/srec. Imprime um
relatorio com OK / AVISO / FALHA por item, a acao corretiva de cada falha, e sai
com codigo 0 quando tudo essencial esta presente.

Somente leitura: nao escreve nada no repositorio, nao muta nada no GitHub e nao
sobe container. Roda em Windows e em Linux, so com a biblioteca padrao.

Uso:
    python .claude/skills/srec-setup/scripts/check_environment.py
    python .claude/skills/srec-setup/scripts/check_environment.py --offline
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import socket
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Fatos do projeto SREC — nao sao configuraveis por ambiente
# ---------------------------------------------------------------------------

FORK = ("igorSeberino", "srec")          # onde a N2 trabalha
UPSTREAM = ("MAGUGI", "SREC")            # de onde o codigo veio
MIN_NODE_MAJOR = 20                      # Express 5 + Vite 8 + CI em Node 20
CI_NODE_MAJOR = 20                       # .github/workflows/ci.yml
MIN_NPM_MAJOR = 9                        # npm que acompanha Node 20
MIN_PYTHON = (3, 9)                      # scripts das skills do time
PORTS = {5432: "PostgreSQL do compose", 5000: "API do server", 5173: "Vite do client"}

# Arquivos que provam que o diretorio e o SREC, e nao outro repo qualquer
SREC_FINGERPRINT = (
    "server/src/index.js",
    "client/src/App.jsx",
    "docs/auditoria/relatorio-n2.md",
)

OK = "OK"
WARN = "AVISO"
FAIL = "FALHA"

_STATUS_WIDTH = max(len(s) for s in (OK, WARN, FAIL))


# ---------------------------------------------------------------------------
# Infra
# ---------------------------------------------------------------------------


class Check:
    """Um item do relatorio."""

    def __init__(self, name, status, detail, remediation="", essential=True):
        self.name = name
        self.status = status
        self.detail = detail
        self.remediation = remediation
        self.essential = essential

    @property
    def blocking(self):
        return self.essential and self.status == FAIL


def run(args, timeout=60):
    """Executa um comando e devolve (returncode, saida combinada)."""
    try:
        completed = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )
    except FileNotFoundError:
        return 127, "executavel nao encontrado"
    except subprocess.TimeoutExpired:
        return 124, "tempo esgotado (%ss) — rede ou daemon pendurado" % timeout
    except OSError as exc:
        return 1, str(exc)
    return completed.returncode, ((completed.stdout or "") + (completed.stderr or "")).strip()


def tool(name):
    """Caminho completo do executavel, ou None.

    Usar o caminho resolvido importa no Windows: `npm` e `npm.cmd` e
    subprocess.run(["npm", ...]) sem shell falharia.
    """
    return shutil.which(name)


def first_int(text):
    match = re.search(r"\d+", text or "")
    return int(match.group()) if match else None


def port_in_use(port, host="127.0.0.1", timeout=0.4):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(timeout)
        return sock.connect_ex((host, port)) == 0


# ---------------------------------------------------------------------------
# Checagens
# ---------------------------------------------------------------------------


def check_python():
    current = "%d.%d.%d" % sys.version_info[:3]
    if sys.version_info < MIN_PYTHON:
        return Check(
            "Python 3",
            FAIL,
            "versao %s, minimo %d.%d" % (current, *MIN_PYTHON),
            "instale o Python %d.%d+ (https://www.python.org/downloads) e garanta que esta no PATH"
            % MIN_PYTHON,
        )
    return Check("Python 3", OK, "%s (%s)" % (current, sys.executable), essential=True)


def check_git():
    exe = tool("git")
    if not exe:
        return [
            Check(
                "git instalado",
                FAIL,
                "nao encontrado no PATH",
                "instale o git: https://git-scm.com/downloads",
            )
        ]
    code, version = run([exe, "--version"])
    checks = [Check("git instalado", OK, version or exe)]

    code, top = run([exe, "rev-parse", "--show-toplevel"])
    if code != 0:
        checks.append(
            Check(
                "git — repositorio",
                FAIL,
                "o diretorio atual nao e um repositorio git",
                "rode de dentro do clone: git clone https://github.com/%s/%s.git && cd %s"
                % (FORK[0], FORK[1], FORK[1]),
            )
        )
        return checks

    root = Path(top.strip())
    checks.append(Check("git — repositorio", OK, str(root)))

    missing = [p for p in SREC_FINGERPRINT if not (root / p).exists()]
    if missing:
        checks.append(
            Check(
                "repositorio e o SREC",
                FAIL,
                "faltam: %s" % ", ".join(missing),
                "este clone nao parece ser o SREC da N2 — confira se voce esta em %s/%s"
                % FORK,
            )
        )
    else:
        checks.append(Check("repositorio e o SREC", OK, "server/, client/ e docs/auditoria/ no lugar"))

    code, origin = run([exe, "remote", "get-url", "origin"])
    origin = origin.strip()
    owner_repo = parse_remote(origin) if code == 0 else None
    if code != 0 or not owner_repo:
        checks.append(
            Check(
                "git — remote origin",
                FAIL,
                "origin: %s" % (origin or "ausente"),
                "git remote add origin https://github.com/%s/%s.git" % FORK,
            )
        )
    elif (owner_repo[0].lower(), owner_repo[1].lower()) == (FORK[0].lower(), FORK[1].lower()):
        checks.append(Check("git — remote origin", OK, "%s/%s" % owner_repo))
    elif (owner_repo[0].lower(), owner_repo[1].lower()) == (UPSTREAM[0].lower(), UPSTREAM[1].lower()):
        checks.append(
            Check(
                "git — remote origin",
                FAIL,
                "origin aponta para o upstream %s/%s, nao para o fork" % UPSTREAM,
                "git remote set-url origin https://github.com/%s/%s.git "
                "(e, se quiser, git remote add upstream https://github.com/%s/%s.git)"
                % (FORK[0], FORK[1], UPSTREAM[0], UPSTREAM[1]),
            )
        )
    else:
        checks.append(
            Check(
                "git — remote origin",
                WARN,
                "origin: %s/%s (o esperado na N2 e %s/%s)" % (owner_repo + FORK),
                "se este nao e um fork intencional, rode "
                "git remote set-url origin https://github.com/%s/%s.git" % FORK,
                essential=False,
            )
        )

    code, branch = run([exe, "rev-parse", "--abbrev-ref", "HEAD"])
    branch = branch.strip()
    if code == 0:
        if branch in ("backend", "frontend", "develop"):
            checks.append(
                Check(
                    "git — branch atual",
                    WARN,
                    "'%s' — branch por camada do repositorio recebido, nao usada na N2" % branch,
                    "git checkout main (main e o unico branch longevo; veja a skill tbd-flow)",
                    essential=False,
                )
            )
        else:
            checks.append(Check("git — branch atual", OK, branch, essential=False))

    code, user = run([exe, "config", "user.email"])
    if code != 0 or not user.strip():
        checks.append(
            Check(
                "git — identidade de commit",
                FAIL,
                "user.email nao configurado — os commits sairiam sem autor valido",
                'git config --global user.name "Seu Nome" && '
                'git config --global user.email "seu@email"',
            )
        )
    else:
        checks.append(Check("git — identidade de commit", OK, user.strip(), essential=False))

    return checks


def parse_remote(url):
    """Extrai (owner, repo) de uma URL https ou ssh do GitHub."""
    match = re.search(r"github\.com[:/]+([^/]+)/([^/\s]+?)(?:\.git)?/?$", url or "")
    if not match:
        return None
    return match.group(1), match.group(2)


def check_gh(offline=False, origin_repo=None):
    exe = tool("gh")
    if not exe:
        return [
            Check(
                "gh instalado",
                FAIL,
                "nao encontrado no PATH",
                "instale o GitHub CLI: https://cli.github.com "
                "(Windows: winget install GitHub.cli | Linux: veja a pagina de instalacao)",
            )
        ]
    code, version = run([exe, "--version"])
    checks = [Check("gh instalado", OK, (version or "").splitlines()[0] if version else exe)]

    code, out = run([exe, "auth", "status"])
    if code != 0:
        checks.append(
            Check(
                "gh — autenticado",
                FAIL,
                (out or "sem saida").splitlines()[0],
                "rode `gh auth login` num terminal seu — e interativo, nao roda dentro da sessao do agente",
            )
        )
        return checks

    account = ""
    match = re.search(r"account\s+(\S+)", out or "")
    if match:
        account = match.group(1)
    checks.append(Check("gh — autenticado", OK, account or "sessao valida"))

    if offline:
        checks.append(
            Check(
                "gh — push no fork",
                WARN,
                "nao verificado (--offline)",
                "rode sem --offline para confirmar a permissao de push",
                essential=False,
            )
        )
        return checks

    owner, repo = origin_repo or FORK
    code, out = run([exe, "api", "repos/%s/%s" % (owner, repo), "--jq", ".permissions.push"])
    answer = (out or "").strip().splitlines()[-1] if out else ""
    if code != 0:
        checks.append(
            Check(
                "gh — push no fork",
                FAIL,
                "nao foi possivel ler as permissoes de %s/%s: %s" % (owner, repo, answer[:120]),
                "confirme que a conta autenticada enxerga o repositorio "
                "(`gh repo view %s/%s`) e que o token tem escopo `repo`; "
                "se e outra conta, `gh auth switch`" % (owner, repo),
            )
        )
    elif answer == "true":
        checks.append(Check("gh — push no fork", OK, "%s/%s com permissao de push" % (owner, repo)))
    else:
        checks.append(
            Check(
                "gh — push no fork",
                FAIL,
                "a conta autenticada tem acesso de leitura em %s/%s, nao de push" % (owner, repo),
                "peca ao Igor (@igorSeberino) para adicionar sua conta como colaboradora do fork, "
                "ou trabalhe num fork proprio e abra o PR cruzado",
            )
        )
    return checks


def check_node():
    exe = tool("node")
    if not exe:
        return [
            Check(
                "Node.js 20",
                FAIL,
                "nao encontrado no PATH",
                "instale o Node.js 20 LTS (https://nodejs.org) — "
                "com nvm: `nvm install 20 && nvm use 20`",
            )
        ]
    code, version = run([exe, "--version"])
    major = first_int(version)
    if code != 0 or major is None:
        return [
            Check(
                "Node.js 20",
                FAIL,
                "`node --version` falhou: %s" % (version or "sem saida"),
                "reinstale o Node.js 20 LTS (https://nodejs.org)",
            )
        ]
    if major < MIN_NODE_MAJOR:
        return [
            Check(
                "Node.js 20",
                FAIL,
                "versao %s — Express 5 e Vite 8 exigem >= %d" % (version.strip(), MIN_NODE_MAJOR),
                "`nvm install 20 && nvm use 20` (ou instale o Node 20 LTS)",
            )
        ]
    if major > CI_NODE_MAJOR:
        return [
            Check(
                "Node.js 20",
                WARN,
                "versao %s — a CI roda em Node %d, entao o que passa aqui pode falhar la"
                % (version.strip(), CI_NODE_MAJOR),
                "`nvm use 20` antes de rodar lint/test, para medir no mesmo ambiente da CI",
                essential=False,
            )
        ]
    return [Check("Node.js 20", OK, version.strip())]


def check_npm():
    exe = tool("npm")
    if not exe:
        return [
            Check(
                "npm",
                FAIL,
                "nao encontrado no PATH",
                "o npm vem com o Node.js 20 — reinstale o Node (https://nodejs.org)",
            )
        ]
    code, version = run([exe, "--version"])
    major = first_int(version)
    if code != 0 or major is None:
        return [
            Check(
                "npm",
                FAIL,
                "`npm --version` falhou: %s" % (version or "sem saida"),
                "reinstale o Node.js 20, que traz o npm",
            )
        ]
    if major < MIN_NPM_MAJOR:
        return [
            Check(
                "npm",
                WARN,
                "versao %s — `npm ci` com lockfile v3 pede >= %d" % (version.strip(), MIN_NPM_MAJOR),
                "`npm install -g npm@10`",
                essential=False,
            )
        ]
    return [Check("npm", OK, version.strip())]


def check_docker():
    """Separa 'Docker instalado' de 'daemon do Docker respondendo'.

    Instalado e so o binario no PATH. O compose do SREC precisa do daemon
    aceitando conexao — no Windows, pelo named pipe do Docker Desktop.
    """
    exe = tool("docker")
    if not exe:
        return [
            Check(
                "Docker instalado",
                FAIL,
                "nao encontrado no PATH",
                "instale o Docker Desktop (https://docs.docker.com/get-docker/) — "
                "e o unico pre-requisito do `docker compose up` do SREC",
            )
        ]

    code, client_version = run([exe, "--version"])
    checks = [Check("Docker instalado", OK, (client_version or exe).strip())]

    code, server_version = run([exe, "info", "--format", "{{.ServerVersion}}"], timeout=90)
    daemon_ok = code == 0 and server_version and "\n" not in server_version.strip()
    if not daemon_ok:
        lowered = (server_version or "").lower()
        if "permission denied" in lowered:
            fix = (
                "Linux: adicione seu usuario ao grupo docker "
                "(`sudo usermod -aG docker $USER`) e reabra a sessao"
            )
        elif "pipe" in lowered or "dockerdesktop" in lowered.replace(" ", ""):
            fix = "Windows: abra o Docker Desktop e espere o icone ficar verde, depois rode de novo"
        else:
            fix = (
                "suba o daemon: Windows/macOS abra o Docker Desktop; "
                "Linux `sudo systemctl start docker`. Confirme com `docker info`"
            )
        checks.append(
            Check(
                "Docker — daemon respondendo",
                FAIL,
                "o binario existe, mas o daemon nao respondeu: %s"
                % (server_version or "sem saida")[:160].replace("\n", " "),
                fix,
            )
        )
        return checks

    checks.append(Check("Docker — daemon respondendo", OK, "engine %s" % server_version.strip()))

    code, compose_version = run([exe, "compose", "version", "--short"])
    if code != 0 or not compose_version:
        checks.append(
            Check(
                "Docker Compose v2",
                FAIL,
                "`docker compose version` falhou: %s" % (compose_version or "sem saida")[:120],
                "instale o plugin Compose v2 (vem no Docker Desktop; "
                "no Linux: `sudo apt install docker-compose-plugin`). "
                "O `docker-compose` v1 com hifen nao serve: a stack usa `--wait` e healthcheck",
            )
        )
    else:
        checks.append(Check("Docker Compose v2", OK, "v%s" % compose_version.strip().lstrip("v")))
    return checks


def check_repo_state(root):
    """Avisos sobre o estado do clone. Nada aqui bloqueia, tudo aqui economiza tempo."""
    checks = []
    if root is None:
        return checks

    compose = root / "docker-compose.yml"
    if compose.exists():
        checks.append(Check("docker-compose.yml", OK, "presente na raiz", essential=False))
    else:
        checks.append(
            Check(
                "docker-compose.yml",
                WARN,
                "ausente — OPS-01 ainda nao foi mergeada em main",
                "use a Opcao B do README (PostgreSQL local) ou implemente a spec: "
                "/implementar ops-01-docker-compose-environment",
                essential=False,
            )
        )

    for label, path, fix in (
        (
            "server/node_modules",
            root / "server" / "node_modules",
            "cd server && npm ci",
        ),
        (
            "client/node_modules",
            root / "client" / "node_modules",
            "cd client && npm ci --legacy-peer-deps   (a flag e obrigatoria: React 19 + Vite 8)",
        ),
    ):
        if path.is_dir():
            checks.append(Check(label, OK, "dependencias instaladas", essential=False))
        else:
            checks.append(
                Check(label, WARN, "dependencias nao instaladas", fix, essential=False)
            )

    env_file = root / "server" / ".env"
    if env_file.exists():
        checks.append(Check("server/.env", OK, "presente (fluxo sem Docker)", essential=False))
    else:
        checks.append(
            Check(
                "server/.env",
                WARN,
                "ausente — necessario so no fluxo sem Docker; o compose declara as variaveis",
                "cp server/.env.example server/.env e ajuste DATABASE_URL",
                essential=False,
            )
        )

    busy = [(port, what) for port, what in PORTS.items() if port_in_use(port)]
    if busy:
        checks.append(
            Check(
                "portas 5432 / 5000 / 5173",
                WARN,
                "ja em uso: %s" % ", ".join("%d (%s)" % (p, w) for p, w in busy),
                "se nao for a stack do SREC, pare o processo (um PostgreSQL local em 5432 "
                "impede o bind do container) ou rode `docker compose down`",
                essential=False,
            )
        )
    else:
        checks.append(Check("portas 5432 / 5000 / 5173", OK, "livres", essential=False))

    return checks


# ---------------------------------------------------------------------------
# Relatorio
# ---------------------------------------------------------------------------


def repo_root():
    exe = tool("git")
    if not exe:
        return None
    code, top = run([exe, "rev-parse", "--show-toplevel"])
    if code != 0 or not top.strip():
        return None
    return Path(top.strip())


def origin_owner_repo():
    exe = tool("git")
    if not exe:
        return None
    code, origin = run([exe, "remote", "get-url", "origin"])
    if code != 0:
        return None
    return parse_remote(origin.strip())


def report(checks):
    print("== SREC - checagem de ambiente (N2) ==")
    print()
    for check in checks:
        print("[%s] %s: %s" % (check.status.ljust(_STATUS_WIDTH), check.name, check.detail))
        if check.status != OK and check.remediation:
            print("%s -> %s" % (" " * (_STATUS_WIDTH + 3), check.remediation))
    print()

    blocking = [c for c in checks if c.blocking]
    warnings = [c for c in checks if c.status == WARN]
    print(
        "%d itens verificados - %d OK, %d AVISO, %d FALHA (%d essenciais)"
        % (
            len(checks),
            sum(1 for c in checks if c.status == OK),
            len(warnings),
            sum(1 for c in checks if c.status == FAIL),
            len(blocking),
        )
    )
    print()

    if blocking:
        print("Ambiente NAO esta pronto. Corrija, em ordem:")
        for index, check in enumerate(blocking, start=1):
            print("  %d. %s - %s" % (index, check.name, check.remediation or "ver detalhe acima"))
        print()
        print("Depois rode este script de novo:")
        print("  python .claude/skills/srec-setup/scripts/check_environment.py")
        return 1

    print("Tudo essencial presente. Ambiente pronto para trabalhar no SREC.")
    if warnings:
        print("Os %d AVISO acima nao bloqueiam, mas leia antes de medir ou abrir PR." % len(warnings))
    print()
    print("Proximos passos: /onboard (primeiro acesso) ou /metricas (medir o estado atual).")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Checagem de ambiente do SREC (N2). Somente leitura."
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="nao consulta a API do GitHub (pula a verificacao de push no fork)",
    )
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass

    root = repo_root()
    if root is not None:
        try:
            os.chdir(root)
        except OSError:
            pass

    checks = []
    checks.append(check_python())
    checks.extend(check_git())
    checks.extend(check_gh(offline=args.offline, origin_repo=origin_owner_repo()))
    checks.extend(check_node())
    checks.extend(check_npm())
    checks.extend(check_docker())
    checks.extend(check_repo_state(root))

    return report(checks)


if __name__ == "__main__":
    sys.exit(main())
