"""Dependency-free validator for schema/data-contract.schema.json.

The supported JSON Schema subset is documented in schema/README.md. Unknown keywords are
rejected instead of ignored, so a schema edit cannot silently weaken validation. `format`
is asserted for `date-time` and `uri`, matching the contract's intent rather than the
JSON Schema default of treating formats as annotations.
"""
from __future__ import annotations

import json
import math
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schema" / "data-contract.schema.json"

ANNOTATIONS = {
    "$schema",
    "$id",
    "title",
    "description",
    "$comment",
    "examples",
    "default",
    "deprecated",
    "readOnly",
    "writeOnly",
}
KEYWORDS = {
    "$ref",
    "type",
    "const",
    "enum",
    "required",
    "properties",
    "additionalProperties",
    "items",
    "prefixItems",
    "minItems",
    "maxItems",
    "minimum",
    "maximum",
    "exclusiveMinimum",
    "exclusiveMaximum",
    "minLength",
    "maxLength",
    "pattern",
    "oneOf",
    "anyOf",
    "allOf",
    "format",
}


class ContractError(ValueError):
    """An instance does not satisfy the bundled data contract."""


class UnsupportedKeyword(ValueError):
    """The schema uses a keyword outside the documented subset."""


@lru_cache(maxsize=1)
def load_schema(path: Path | None = None) -> dict:
    schema = json.loads((path or SCHEMA_PATH).read_text())
    _check_schema_structure(schema, "$")
    return schema


def _check_schema_structure(node, path: str) -> None:
    """Reject unsupported keywords anywhere in the schema, including unused branches."""
    if isinstance(node, bool):
        return
    if not isinstance(node, dict):
        raise UnsupportedKeyword(f"Schema node at {path} is not an object or boolean")
    unknown = set(node) - KEYWORDS - ANNOTATIONS - {"$defs"}
    if unknown:
        raise UnsupportedKeyword(f"Unsupported schema keyword(s) at {path}: {', '.join(sorted(unknown))}")
    for name, child in node.get("$defs", {}).items():
        _check_schema_structure(child, f"{path}.$defs.{name}")
    for name, child in node.get("properties", {}).items():
        _check_schema_structure(child, f"{path}.properties.{name}")
    for key in ("items", "additionalProperties"):
        if isinstance(node.get(key), dict):
            _check_schema_structure(node[key], f"{path}.{key}")
    for key in ("prefixItems", "oneOf", "anyOf", "allOf"):
        for index, child in enumerate(node.get(key, [])):
            _check_schema_structure(child, f"{path}.{key}[{index}]")


def _same_json(a, b) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a is b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_same_json(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) == set(b) and all(_same_json(a[k], b[k]) for k in a)
    return a == b


def _is_type(value, name: str) -> bool:
    if name == "null":
        return value is None
    if name == "boolean":
        return isinstance(value, bool)
    if name == "integer":
        return (
            isinstance(value, int) and not isinstance(value, bool)
        ) or (isinstance(value, float) and value.is_integer())
    if name == "number":
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and math.isfinite(value)
        )
    if name == "string":
        return isinstance(value, str)
    if name == "array":
        return isinstance(value, list)
    if name == "object":
        return isinstance(value, dict)
    raise UnsupportedKeyword(f"Unsupported type: {name}")


def _check_format(value: str, name: str) -> bool:
    if name == "date-time":
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return False
        return parsed.tzinfo is not None
    if name == "uri":
        parsed = urlparse(value)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
    raise UnsupportedKeyword(f"Unsupported format: {name}")


def _fail(errors: list[str], path: str, message: str) -> None:
    errors.append(f"{path}: {message}")


def _check(instance, node, schema: dict, path: str, errors: list[str]) -> None:
    if node is True:
        return
    if node is False:
        _fail(errors, path, "no value is allowed here")
        return
    if not isinstance(node, dict):
        raise UnsupportedKeyword(f"Schema node at {path} is not an object or boolean")

    unknown = set(node) - KEYWORDS - ANNOTATIONS
    if unknown:
        raise UnsupportedKeyword(f"Unsupported schema keyword(s): {', '.join(sorted(unknown))}")

    if "$ref" in node:
        target = node["$ref"]
        match = re.fullmatch(r"#/\$defs/([A-Za-z0-9_-]+)", target)
        if not match or match.group(1) not in schema.get("$defs", {}):
            raise UnsupportedKeyword(f"Unsupported $ref: {target}")
        _check(instance, schema["$defs"][match.group(1)], schema, path, errors)
        return

    if "type" in node:
        names = node["type"] if isinstance(node["type"], list) else [node["type"]]
        if not any(_is_type(instance, name) for name in names):
            _fail(errors, path, f"expected {' or '.join(names)}")
            return

    if "const" in node and not _same_json(instance, node["const"]):
        _fail(errors, path, f"expected constant {json.dumps(node['const'])[:120]}")

    if "enum" in node and not any(_same_json(instance, allowed) for allowed in node["enum"]):
        _fail(errors, path, f"expected one of {json.dumps(node['enum'])[:160]}")

    if "oneOf" in node:
        matches = sum(_valid(instance, branch, schema) for branch in node["oneOf"])
        if matches != 1:
            _fail(errors, path, f"must match exactly one oneOf branch (matched {matches})")
    if "anyOf" in node and not any(_valid(instance, branch, schema) for branch in node["anyOf"]):
        _fail(errors, path, "must match at least one anyOf branch")
    for branch in node.get("allOf", []):
        _check(instance, branch, schema, path, errors)

    if isinstance(instance, dict):
        _check_object(instance, node, schema, path, errors)
    elif isinstance(instance, list):
        _check_array(instance, node, schema, path, errors)
    elif isinstance(instance, str):
        if "minLength" in node and len(instance) < node["minLength"]:
            _fail(errors, path, f"shorter than {node['minLength']} characters")
        if "maxLength" in node and len(instance) > node["maxLength"]:
            _fail(errors, path, f"longer than {node['maxLength']} characters")
        if "pattern" in node and re.search(node["pattern"], instance) is None:
            _fail(errors, path, f"does not match {node['pattern']}")
        if "format" in node and not _check_format(instance, node["format"]):
            _fail(errors, path, f"is not a valid {node['format']}")
    elif isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if not math.isfinite(instance):
            _fail(errors, path, "is not finite")
        if "minimum" in node and instance < node["minimum"]:
            _fail(errors, path, f"is below {node['minimum']}")
        if "maximum" in node and instance > node["maximum"]:
            _fail(errors, path, f"is above {node['maximum']}")
        if "exclusiveMinimum" in node and instance <= node["exclusiveMinimum"]:
            _fail(errors, path, f"must be greater than {node['exclusiveMinimum']}")
        if "exclusiveMaximum" in node and instance >= node["exclusiveMaximum"]:
            _fail(errors, path, f"must be less than {node['exclusiveMaximum']}")


def _check_object(instance, node, schema, path, errors) -> None:
    for key in node.get("required", []):
        if key not in instance:
            _fail(errors, path, f"missing required property {key!r}")
    properties = node.get("properties", {})
    additional = node.get("additionalProperties", True)
    for key, value in instance.items():
        child_path = f"{path}.{key}"
        if key in properties:
            _check(value, properties[key], schema, child_path, errors)
        elif additional is False:
            _fail(errors, child_path, "unexpected property")
        elif isinstance(additional, dict):
            _check(value, additional, schema, child_path, errors)


def _check_array(instance, node, schema, path, errors) -> None:
    prefix = node.get("prefixItems", [])
    for index, child in enumerate(prefix[: len(instance)]):
        _check(instance[index], child, schema, f"{path}[{index}]", errors)
    if "minItems" in node and len(instance) < node["minItems"]:
        _fail(errors, path, f"has fewer than {node['minItems']} items")
    if "maxItems" in node and len(instance) > node["maxItems"]:
        _fail(errors, path, f"has more than {node['maxItems']} items")
    items = node.get("items", True)
    if items is False:
        if len(instance) > len(prefix):
            _fail(errors, path, f"has more than {len(prefix)} items")
    elif isinstance(items, dict):
        for index in range(len(prefix), len(instance)):
            _check(instance[index], items, schema, f"{path}[{index}]", errors)


def _valid(instance, node, schema) -> bool:
    errors: list[str] = []
    _check(instance, node, schema, "$", errors)
    return not errors


def validate(instance, definition: str, schema: dict | None = None) -> None:
    """Raise ContractError unless `instance` matches the named $defs entry."""
    schema = schema or load_schema()
    definitions = schema.get("$defs", {})
    if definition not in definitions:
        raise KeyError(f"Unknown contract definition: {definition}")
    errors: list[str] = []
    _check(instance, definitions[definition], schema, "$", errors)
    if errors:
        shown = "; ".join(errors[:8])
        more = f" (+{len(errors) - 8} more)" if len(errors) > 8 else ""
        raise ContractError(f"{definition}: {shown}{more}")
