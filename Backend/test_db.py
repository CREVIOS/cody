import asyncio
from db import engine
from sqlalchemy import text

async def test_db():
    try:
        print("Testing database connection...")
        async with engine.connect() as conn:
            result = await conn.execute(text('SELECT 1'))
            print('Database connection successful')
            await conn.commit()
        return True
    except Exception as e:
        print(f'Database connection failed: {e}')
        return False

if __name__ == "__main__":
    success = asyncio.run(test_db())
    if success:
        print("Database test passed")
    else:
        print("Database test failed") 