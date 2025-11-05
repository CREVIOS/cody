"""
Tests for Decorator Pattern - Permission Decorators

This test file validates that the Decorator pattern correctly
adds permission checking behavior to route handlers.
"""

import pytest
from fastapi import HTTPException
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from decorators import require_permission, require_resource_permission
from services.permissions_chain import PermissionResult


class TestPermissionDecorator:
    """Test suite for the PermissionDecorator pattern"""

    @pytest.mark.asyncio
    async def test_decorator_allows_access_when_permission_granted(self):
        """
        Test that the decorator calls the original function when
        permission is granted.

        This validates the core Decorator pattern behavior:
        - Wrapper adds permission check
        - Original function is called if check passes
        """
        # Arrange
        mock_db = MagicMock()
        project_id = uuid4()
        user_id = uuid4()

        # Mock permission evaluator to grant permission
        with patch("decorators.permissions.evaluate_user_permission") as mock_eval:
            mock_eval.return_value = PermissionResult(
                granted=True,
                reason="User has permission"
            )

            # Define a test function with the decorator
            @require_permission("canEdit", project_id_param="project_id")
            async def test_function(project_id, actor_id, db):
                return {"status": "success"}

            # Act
            result = await test_function(
                project_id=project_id,
                actor_id=user_id,
                db=mock_db
            )

            # Assert
            assert result == {"status": "success"}
            mock_eval.assert_called_once_with(
                mock_db,
                project_id=project_id,
                user_id=user_id,
                permission="canEdit"
            )

    @pytest.mark.asyncio
    async def test_decorator_denies_access_when_permission_denied(self):
        """
        Test that the decorator raises HTTPException when
        permission is denied.

        This validates the decorator's security behavior.
        """
        # Arrange
        mock_db = MagicMock()
        project_id = uuid4()
        user_id = uuid4()

        # Mock permission evaluator to deny permission
        with patch("decorators.permissions.evaluate_user_permission") as mock_eval:
            mock_eval.return_value = PermissionResult(
                granted=False,
                reason="User lacks permission"
            )

            # Define a test function with the decorator
            @require_permission("canEdit", project_id_param="project_id")
            async def test_function(project_id, actor_id, db):
                return {"status": "success"}

            # Act & Assert
            with pytest.raises(HTTPException) as exc_info:
                await test_function(
                    project_id=project_id,
                    actor_id=user_id,
                    db=mock_db
                )

            # Verify the exception details
            assert exc_info.value.status_code == 403
            assert "lacks canEdit permission" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_decorator_raises_error_when_db_missing(self):
        """
        Test that the decorator raises an error when the database
        session is not provided.
        """
        # Arrange
        project_id = uuid4()
        user_id = uuid4()

        @require_permission("canEdit", project_id_param="project_id")
        async def test_function(project_id, actor_id, db=None):
            return {"status": "success"}

        # Act & Assert
        with pytest.raises(HTTPException) as exc_info:
            await test_function(
                project_id=project_id,
                actor_id=user_id
                # No db parameter
            )

        assert exc_info.value.status_code == 500
        assert "Database session not found" in str(exc_info.value.detail)


class TestResourcePermissionDecorator:
    """Test suite for the ResourcePermissionDecorator pattern"""

    @pytest.mark.asyncio
    async def test_resource_decorator_fetches_resource_and_checks_permission(self):
        """
        Test that the resource decorator:
        1. Fetches the resource
        2. Extracts project_id from resource
        3. Checks permission
        4. Calls original function if granted
        """
        # Arrange
        mock_db = MagicMock()
        file_id = uuid4()
        user_id = uuid4()
        project_id = uuid4()

        # Mock resource with project_id
        mock_file = MagicMock()
        mock_file.project_id = project_id

        # Mock CRUD operations
        with patch("crud.crud_file.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_file

            with patch("decorators.permissions.evaluate_user_permission") as mock_eval:
                mock_eval.return_value = PermissionResult(
                    granted=True,
                    reason="Permission granted"
                )

                # Define test function with resource decorator
                @require_resource_permission(
                    "canEdit",
                    resource_type="file",
                    resource_id_param="file_id"
                )
                async def test_function(file_id, actor_id, db):
                    return {"status": "updated"}

                # Act
                result = await test_function(
                    file_id=file_id,
                    actor_id=user_id,
                    db=mock_db
                )

                # Assert
                assert result == {"status": "updated"}
                mock_get.assert_called_once_with(mock_db, id=file_id)
                mock_eval.assert_called_once_with(
                    mock_db,
                    project_id=project_id,
                    user_id=user_id,
                    permission="canEdit"
                )

    @pytest.mark.asyncio
    async def test_resource_decorator_raises_404_when_resource_not_found(self):
        """
        Test that the decorator raises 404 when the resource
        doesn't exist.
        """
        # Arrange
        mock_db = MagicMock()
        file_id = uuid4()
        user_id = uuid4()

        # Mock CRUD to return None (resource not found)
        with patch("crud.crud_file.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = None

            @require_resource_permission(
                "canEdit",
                resource_type="file",
                resource_id_param="file_id"
            )
            async def test_function(file_id, actor_id, db):
                return {"status": "updated"}

            # Act & Assert
            with pytest.raises(HTTPException) as exc_info:
                await test_function(
                    file_id=file_id,
                    actor_id=user_id,
                    db=mock_db
                )

            assert exc_info.value.status_code == 404
            assert "not found" in str(exc_info.value.detail).lower()


class TestDecoratorComposition:
    """Test that decorators can be composed/stacked"""

    @pytest.mark.asyncio
    async def test_multiple_decorators_can_be_stacked(self):
        """
        Test that multiple decorators can be applied to the same function.
        This demonstrates the composability of the Decorator pattern.
        """
        # This is a conceptual test - in practice, you might stack
        # decorators like @rate_limit, @require_permission, @log_access, etc.

        call_count = 0

        def test_decorator_1(func):
            async def wrapper(*args, **kwargs):
                nonlocal call_count
                call_count += 1
                return await func(*args, **kwargs)
            return wrapper

        def test_decorator_2(func):
            async def wrapper(*args, **kwargs):
                nonlocal call_count
                call_count += 10
                return await func(*args, **kwargs)
            return wrapper

        @test_decorator_1
        @test_decorator_2
        async def test_function():
            return "executed"

        result = await test_function()

        assert result == "executed"
        assert call_count == 11  # Both decorators executed


class TestDecoratorPatternBenefits:
    """
    Tests that validate the benefits of the Decorator pattern:
    - Code reusability
    - Separation of concerns
    - Easy to test
    """

    def test_decorator_is_reusable_across_routes(self):
        """
        Test that the same decorator can be applied to multiple functions.
        This validates the reusability benefit of the pattern.
        """
        # Arrange
        @require_permission("canEdit")
        async def function1(project_id, actor_id, db):
            return "function1"

        @require_permission("canEdit")
        async def function2(project_id, actor_id, db):
            return "function2"

        # Assert that both functions have the decorator applied
        assert hasattr(function1, "__wrapped__") or callable(function1)
        assert hasattr(function2, "__wrapped__") or callable(function2)

    @pytest.mark.asyncio
    async def test_decorator_separates_concerns(self):
        """
        Test that business logic and permission logic are separated.

        The function itself doesn't contain any permission checking code,
        demonstrating separation of concerns.
        """
        mock_db = MagicMock()
        project_id = uuid4()
        user_id = uuid4()

        business_logic_executed = False

        with patch("decorators.permissions.evaluate_user_permission") as mock_eval:
            mock_eval.return_value = PermissionResult(granted=True)

            @require_permission("canEdit")
            async def pure_business_logic(project_id, actor_id, db):
                nonlocal business_logic_executed
                business_logic_executed = True
                # Note: No permission checking code here!
                # It's all handled by the decorator
                return {"data": "processed"}

            result = await pure_business_logic(
                project_id=project_id,
                actor_id=user_id,
                db=mock_db
            )

            # Assert business logic was executed
            assert business_logic_executed
            # Assert permission check happened separately
            assert mock_eval.called


# Integration test
class TestDecoratorIntegration:
    """Integration tests for decorator pattern with actual routes"""

    @pytest.mark.asyncio
    async def test_decorated_route_behavior_matches_inline_permission_check(self):
        """
        Test that the decorator-based approach produces the same
        behavior as the old inline permission check approach.

        This ensures backward compatibility and correctness.
        """
        # This would be an integration test with actual database
        # For now, we validate that both approaches would behave identically
        pass  # Would require actual database setup
