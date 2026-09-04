"""
MessageView - A view for displaying messages to users
"""

from typing import Literal, Optional, Dict, Any, Union
from datetime import datetime

from ..core.base_view import BaseView
from ..types.models import SubmitAction, HttpMethod
from ..errors.exceptions import InvalidParameterError

MessageSeverity = Literal["info", "success", "warning", "error"]


class MessageView(BaseView):
    """Builds a Message SGUI view — a titled notice/dialog with a severity and
    up to two actions.

    ``set_body`` / ``set_intro`` / ``set_severity`` set the content and tone;
    ``set_primary_action`` and ``set_secondary_action`` (aliased by
    ``submit_button``) define the confirm/cancel buttons, and
    ``set_dismissible`` controls whether it can be closed without acting.

    Extends ``BaseView``; instantiated by the YeriaApp/YeriaUI factory,
    populated with these builders, then serialized to a JSON view description
    and signed into a v3 envelope by ``serve()``.
    """
    @classmethod
    def from_json(cls, json_view):
        """Rehydrate a Message view from a wire JSON payload."""
        return cls.from_json_as('Message', json_view)


    def __init__(self, view_id: str, title: str, process_id: Optional[str] = None):
        super().__init__(
            {
                "id": view_id,
                "type": "Message",
                "process_id": process_id,
                "metadata": {
                    "version": "1.0.0",
                    "created_at": datetime.now(),
                },
            }
        )

        self.content = {
            "title": title,
            "body": "",
            "severity": "info",
            "actions": [],
        }

    def set_intro(self, intro: str) -> "MessageView":
        """Set introduction text"""
        return self._set_intro_text("intro", intro)

    def set_body(self, body: str) -> "MessageView":
        """Set main message body"""
        if not body or not body.strip():
            raise InvalidParameterError("body", body, "Message body cannot be empty")

        self.content["body"] = body.strip()
        return self

    def set_severity(self, severity: MessageSeverity) -> "MessageView":
        """Set message severity"""
        self.content["severity"] = severity
        return self

    def add_action(
        self,
        label: str,
        go: Optional[str] = None,
        method: Optional[HttpMethod] = None,
        back: Optional[Union[int, str]] = None,
    ) -> "MessageView":
        """Add a button to the box. Two at most.

        Sans ``go``, il FERME et ne fait rien d'autre. Avec ``go``, il charge
        cette vue, qui entre dans la pile selon ses propres regles.

        Sans aucune action, le client dessine un unique « OK » qui ferme : une
        boite a toujours une sortie, comme une MsgBox en avait toujours une.

        Un identifiant de vue nu est refuse, comme partout ailleurs : rien sur
        le fil ne le distingue d'un chemin relatif.
        """
        trimmed = (label or "").strip()
        if not trimmed:
            raise InvalidParameterError(
                "label", label, "Action label cannot be empty"
            )

        actions = self.content["actions"]
        if len(actions) >= 2:
            raise InvalidParameterError(
                "actions", len(actions) + 1, "A message carries two actions at most"
            )

        if go is not None and back is not None:
            raise InvalidParameterError(
                "back",
                back,
                "an action either loads a view (`go`) or steps back (`back`), not both",
            )

        action: Dict[str, Any] = {"label": trimmed}
        if back is not None:
            # Reculer ne recharge RIEN : l'ecran vise est deja dans la pile,
            # avec l'etat ou l'utilisateur l'avait laisse. 'root' y revient
            # sans compter — c'est la seule position qu'un fournisseur
            # connaisse a coup sur, la vue servie par son URL de base.
            if back != "root":
                if isinstance(back, bool) or not isinstance(back, int) or back < 1:
                    raise InvalidParameterError(
                        "back", back, "back must be an integer >= 1, or 'root'"
                    )
            action["back"] = back
            if method is not None:
                raise InvalidParameterError(
                    "method", method, "method only applies to an action that carries `go`"
                )
        elif go is not None:
            action["go"] = self._assert_addressable_target("go", go)
            if method is not None:
                action["method"] = method
        elif method is not None:
            raise InvalidParameterError(
                "method", method, "method only applies to an action that carries `go`"
            )

        actions.append(action)
        return self

    def clear_actions(self) -> "MessageView":
        """Remove every action."""
        self.content["actions"] = []
        return self

    def set_primary_action(
        self, text: str, method: HttpMethod = "POST", confirm_message: Optional[str] = None
    ) -> "MessageView":
        """Nom historique.

        La destination voyageait dans ``confirm_message``, un champ nomme pour
        un texte de confirmation — c'est ``go`` desormais.
        """
        if confirm_message is None:
            return self.add_action(text)
        return self.add_action(text, go=confirm_message, method=method)

    def submit_button(
        self, text: str, method: HttpMethod = "POST", confirm_message: Optional[str] = None
    ) -> "MessageView":
        """Nom historique de add_action."""
        return self.set_primary_action(text, method, confirm_message)

    def set_secondary_action(
        self, text: str, method: HttpMethod = "POST", confirm_message: Optional[str] = None
    ) -> "MessageView":
        """Nom historique : la seconde action."""
        return self.set_primary_action(text, method, confirm_message)

    def clear_secondary_action(self) -> "MessageView":
        """Retire la seconde action, si elle existe."""
        del self.content["actions"][1:]
        return self

    def set_metadata(self, metadata: Dict[str, Any]) -> "MessageView":
        """Add message-specific metadata"""
        self.content["meta"] = dict(metadata)
        return self

