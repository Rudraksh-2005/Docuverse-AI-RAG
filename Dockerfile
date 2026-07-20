# Use an official Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements first (better Docker caching)
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire project
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Start the FastAPI application
CMD ["uvicorn", "backend.main1:app", "--host", "0.0.0.0", "--port", "8000"]