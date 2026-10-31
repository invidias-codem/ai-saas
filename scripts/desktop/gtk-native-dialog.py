"""Operate real GTK dialog controls through AT-SPI; never substitute native IPC."""
import argparse
import json
import pathlib
import time

import pyatspi


def descendants(root, maximum=5000):
    pending = [root]
    seen = 0
    while pending and seen < maximum:
        node = pending.pop(0)
        seen += 1
        yield node
        try:
            pending.extend(node.getChildAtIndex(index) for index in range(node.childCount))
        except Exception:
            continue


def showing(node):
    return node.getState().contains(pyatspi.STATE_SHOWING)


def invoke(node, names):
    actions = node.queryAction()
    for index in range(actions.nActions):
        if actions.getName(index).lower() in names:
            if not actions.doAction(index):
                raise RuntimeError('Native accessibility action was refused')
            return
    raise RuntimeError('Expected native accessibility action is unavailable')


def run(args):
    deadline = time.monotonic() + 25
    window = None
    while time.monotonic() < deadline:
        candidates = []
        desktop = pyatspi.Registry.getDesktop(0)
        for app in desktop:
            for child in app:
                if child.name == args.title and showing(child):
                    candidates.append(child)
        if len(candidates) > 1:
            raise RuntimeError('Native GTK dialog identity is ambiguous')
        if candidates:
            window = candidates[0]
            break
        time.sleep(0.2)
    if window is None:
        raise RuntimeError('Expected GTK dialog is not exposed to accessibility')
    try:
        if args.kind == 'folder' and args.action == 'accept':
            entries = []
            for node in descendants(window):
                if showing(node) and node.getState().contains(pyatspi.STATE_EDITABLE):
                    try:
                        node.queryEditableText()
                        entries.append(node)
                    except NotImplementedError:
                        continue
            named = [node for node in entries if 'location' in node.name.lower()]
            focused = [node for node in entries if node.getState().contains(pyatspi.STATE_FOCUSED)]
            selected = named or focused or entries
            if len(selected) != 1:
                raise RuntimeError('The native GTK location entry is ambiguous')
            entry = selected[0]
            if not entry.queryEditableText().setTextContents(args.folder):
                raise RuntimeError('Native GTK location entry refused the fixture path')
            invoke(entry, {'activate'})
            time.sleep(0.2)
        labels = {'Cancel'} if args.action == 'cancel' else {
            'folder': {'Open', 'Select', 'Select Folder'},
            'read': {'Allow read access', 'OK'},
            'write': {'Allow reviewed changes', 'OK'},
        }[args.kind]
        while time.monotonic() < deadline:
            if args.kind == 'folder' and (window.getState().contains(pyatspi.STATE_DEFUNCT) or not showing(window)):
                # Activating the location can select the folder immediately.
                # The caller still requires the separate consent and exact grant.
                return
            buttons = [node for node in descendants(window) if node.name in labels
                       and node.getRole() == pyatspi.ROLE_PUSH_BUTTON and showing(node)
                       and node.getState().contains(pyatspi.STATE_SENSITIVE)]
            if len(buttons) > 1:
                raise RuntimeError('Native GTK response is ambiguous')
            if buttons:
                invoke(buttons[0], {'click', 'activate', 'press'})
                return
            time.sleep(0.2)
        raise RuntimeError('The native GTK response did not become available')
    finally:
        tree = []
        try:
            for node in descendants(window, 200):
                tree.append({'role': node.getRoleName(), 'name': node.name,
                             'showing': showing(node), 'sensitive': node.getState().contains(pyatspi.STATE_SENSITIVE)})
        except Exception:
            pass
        pathlib.Path(args.evidence).write_text(json.dumps(tree, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--title', required=True)
    parser.add_argument('--kind', choices=['folder', 'read', 'write'], required=True)
    parser.add_argument('--action', choices=['accept', 'cancel'], required=True)
    parser.add_argument('--folder', default='')
    parser.add_argument('--evidence', required=True)
    run(parser.parse_args())
