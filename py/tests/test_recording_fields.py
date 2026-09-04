"""
Tests for the audio/video recording form fields.

Mirrors js/tests/recording-fields.test.ts. These lock two things the renderer
depends on: the wire shape (fieldType, accept as MIME types, capture
constraints), and the build-time guards that stop a provider shipping a video
field with no duration bound — the only thing keeping an upload inside a
provider's request body limit.
"""

import pytest

from yeriasdk.views.form_view import FormView
from yeriasdk.utils.validators import FieldValidator
from yeriasdk.types.models import FormFieldParams


def fields_of(form: FormView):
    return form.to_json()["content"]["fields"]


def field_by_id(form: FormView, field_id: str):
    return next(f for f in fields_of(form) if f["fieldId"] == field_id)


class TestAudioField:
    def test_emits_audio_type_with_resolved_mime_types(self):
        form = FormView("f", "F")
        form.add_audio_field("note", "Voice note", True, max_duration=60)

        field = field_by_id(form, "note")
        assert field["fieldType"] == "audio"
        assert field["required"] is True
        assert field["maxDuration"] == 60
        assert field["accept"] == ["audio/mp4", "audio/mpeg", "audio/wav", "audio/aac"]

    def test_carries_capture_constraints(self):
        form = FormView("f", "F")
        form.add_audio_field(
            "note",
            "Voice note",
            False,
            max_duration=30,
            min_duration=2,
            source="record",
            max_size=2 * 1024 * 1024,
            multiple=True,
            max_count=3,
        )

        field = field_by_id(form, "note")
        assert field["minDuration"] == 2
        assert field["source"] == "record"
        assert field["maxSize"] == 2 * 1024 * 1024
        assert field["multiple"] is True
        assert field["maxCount"] == 3

    def test_custom_formats_and_unknown_rejected(self):
        form = FormView("f", "F")
        form.add_audio_field("note", "Voice note", max_duration=60, formats=["opus"])
        assert field_by_id(form, "note")["accept"] == ["audio/opus"]

        with pytest.raises(Exception):
            FormView("f2", "F2").add_audio_field(
                "n", "N", max_duration=60, formats=["flac"]
            )

    def test_builds_without_max_duration_but_warns(self):
        form = FormView("f", "F")
        form.add_audio_field("note", "Voice note")

        result = FieldValidator.validate_field(
            "audio", "note", "Voice note", FormFieldParams(accept=["audio/mp4"])
        )
        assert result.is_valid is True
        assert any("maxDuration" in w.message for w in result.warnings)


class TestVideoField:
    def test_emits_video_type_and_defaults_quality_to_medium(self):
        form = FormView("f", "F")
        form.add_video_field("clip", "Damage clip", True, max_duration=45)

        field = field_by_id(form, "clip")
        assert field["fieldType"] == "video"
        assert field["maxDuration"] == 45
        assert field["quality"] == "medium"
        assert field["accept"] == ["video/mp4", "video/quicktime", "video/webm"]

    def test_quality_and_source_overridable(self):
        form = FormView("f", "F")
        form.add_video_field(
            "clip", "Clip", False, max_duration=20, quality="low", source="record"
        )

        field = field_by_id(form, "clip")
        assert field["quality"] == "low"
        assert field["source"] == "record"

    def test_refuses_video_without_max_duration(self):
        form = FormView("f", "F")
        with pytest.raises(Exception):
            form.add_video_field("clip", "Clip")


class TestRecordingConstraints:
    def base(self, **overrides):
        params = {"accept": ["video/mp4"], "max_duration": 30}
        params.update(overrides)
        return FormFieldParams(**params)

    def test_rejects_non_positive_max_duration(self):
        result = FieldValidator.validate_field(
            "video", "clip", "Clip", self.base(max_duration=0)
        )
        assert result.is_valid is False

    def test_rejects_min_duration_greater_than_max(self):
        result = FieldValidator.validate_field(
            "video", "clip", "Clip", self.base(min_duration=60)
        )
        assert result.is_valid is False

    def test_rejects_unknown_source(self):
        result = FieldValidator.validate_field(
            "audio",
            "note",
            "Note",
            FormFieldParams(accept=["audio/mp4"], max_duration=30, source="camera"),
        )
        assert result.is_valid is False

    def test_rejects_unknown_quality(self):
        result = FieldValidator.validate_field(
            "video", "clip", "Clip", self.base(quality="ultra")
        )
        assert result.is_valid is False

    def test_warns_when_quality_set_on_audio(self):
        result = FieldValidator.validate_field(
            "audio",
            "note",
            "Note",
            FormFieldParams(accept=["audio/mp4"], max_duration=30, quality="high"),
        )
        assert result.is_valid is True
        assert any("quality" in w.message for w in result.warnings)

    def test_rejects_non_positive_max_size(self):
        result = FieldValidator.validate_field(
            "audio",
            "note",
            "Note",
            FormFieldParams(accept=["audio/mp4"], max_duration=30, max_size=0),
        )
        assert result.is_valid is False

    def test_requires_accepted_types(self):
        result = FieldValidator.validate_field(
            "audio", "note", "Note", FormFieldParams(max_duration=30)
        )
        assert result.is_valid is False


class TestMultiCapture:
    def test_rejects_non_integer_max_count(self):
        result = FieldValidator.validate_field(
            "photo",
            "pics",
            "Pics",
            FormFieldParams(accept=["image/jpeg"], multiple=True, max_count=2.5),
        )
        assert result.is_valid is False

    def test_warns_when_max_count_without_multiple(self):
        result = FieldValidator.validate_field(
            "photo",
            "pics",
            "Pics",
            FormFieldParams(accept=["image/jpeg"], max_count=4),
        )
        assert result.is_valid is True
        assert any("maxCount" in w.message for w in result.warnings)

    def test_photo_builder_passes_multi_capture_params(self):
        form = FormView("f", "F")
        form.add_photo_field(
            "pics", "Pictures", True, ["jpeg"], False,
            multiple=True, max_count=4, source="record",
        )

        field = field_by_id(form, "pics")
        assert field["multiple"] is True
        assert field["maxCount"] == 4
        assert field["source"] == "record"

    def test_file_builder_passes_multi_capture_params(self):
        form = FormView("f", "F")
        form.add_file_field(
            "docs", "Documents", False, ["application/pdf"], multiple=True, max_count=2
        )

        field = field_by_id(form, "docs")
        assert field["multiple"] is True
        assert field["maxCount"] == 2
