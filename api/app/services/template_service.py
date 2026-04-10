from jinja2 import TemplateError, meta
from jinja2.sandbox import SandboxedEnvironment
from jinja2 import StrictUndefined


class TemplateService:
    """
    Renders Jinja2 templates in a sandboxed environment.

    Uses SandboxedEnvironment to prevent SSTI — attribute traversal
    like {{ ''.__class__.__mro__ }} is blocked at the sandbox level.
    StrictUndefined raises on any undefined variable so callers get
    clear error messages instead of silent empty substitutions.
    """

    def __init__(self) -> None:
        self._env = SandboxedEnvironment(
            autoescape=False,
            undefined=StrictUndefined,
        )

    def find_variables(self, template_str: str) -> list[str]:
        """Return sorted list of undeclared variable names in the template."""
        ast = self._env.parse(template_str)
        return sorted(meta.find_undeclared_variables(ast))

    def render(self, template_str: str, variables: dict[str, str]) -> str:
        """
        Render template_str with the given variables.

        Raises TemplateError (a subclass of Exception) on syntax errors,
        undefined variables, or sandbox violations.
        """
        template = self._env.from_string(template_str)
        return template.render(**variables)
