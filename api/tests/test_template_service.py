import pytest
from jinja2 import TemplateError

from app.services.template_service import TemplateService


@pytest.fixture
def svc():
    return TemplateService()


# ── find_variables ─────────────────────────────────────────────────────────────


def test_find_variables_simple(svc):
    assert svc.find_variables("Hello {{name}}!") == ["name"]


def test_find_variables_multiple(svc):
    assert svc.find_variables("{{a}} and {{b}} and {{a}}") == ["a", "b"]


def test_find_variables_none(svc):
    assert svc.find_variables("No placeholders here.") == []


def test_find_variables_jinja_control(svc):
    tmpl = "{% for item in items %}{{ item }}{% endfor %}"
    # "items" is declared in the for loop, "item" is the loop variable
    vars_ = svc.find_variables(tmpl)
    assert "items" in vars_


# ── render ─────────────────────────────────────────────────────────────────────


def test_render_simple_substitution(svc):
    assert svc.render("Hello {{name}}!", {"name": "World"}) == "Hello World!"


def test_render_multiple_variables(svc):
    result = svc.render("{{a}} + {{b}}", {"a": "foo", "b": "bar"})
    assert result == "foo + bar"


def test_render_loop(svc):
    result = svc.render(
        "{% for item in items %}{{ item }} {% endfor %}",
        {"items": ["a", "b", "c"]},
    )
    assert result.strip() == "a b c"


def test_render_raises_on_undefined_variable(svc):
    with pytest.raises(TemplateError):
        svc.render("Hello {{missing}}!", {})


def test_render_raises_on_syntax_error(svc):
    with pytest.raises(TemplateError):
        svc.render("{% if %}", {})


# ── SSTI protection (R1) ───────────────────────────────────────────────────────


def test_ssti_class_traversal_is_blocked(svc):
    """SandboxedEnvironment must block __class__.__mro__ traversal."""
    with pytest.raises(Exception):
        svc.render("{{ ''.__class__.__mro__ }}", {})


def test_ssti_subclasses_is_blocked(svc):
    with pytest.raises(Exception):
        svc.render("{{ ''.__class__.__mro__[1].__subclasses__() }}", {})


def test_ssti_globals_is_blocked(svc):
    with pytest.raises(Exception):
        svc.render("{{ self.__dict__ }}", {})
