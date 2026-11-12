from __future__ import annotations

from functools import lru_cache

from langchain_core.language_models.chat_models import BaseChatModel

from app.config import get_settings


@lru_cache
def get_llm() -> BaseChatModel:
    s = get_settings()
    if not s.llm_model:
        raise RuntimeError("LLM_MODEL is not set")
    temp = {} if s.llm_temperature is None else {"temperature": s.llm_temperature}

    match s.llm_provider:
        case "groq":  # needs the GROQ_API_KEY env var
            from langchain_groq import ChatGroq

            return ChatGroq(
                model=s.llm_model, max_tokens=s.llm_max_tokens,
                timeout=s.llm_timeout_s, max_retries=2, **temp,
            )
        case "openai":
            from langchain_openai import ChatOpenAI

            return ChatOpenAI(
                model=s.llm_model, max_tokens=s.llm_max_tokens,
                timeout=s.llm_timeout_s, max_retries=2, **temp,
            )
        case "azure_openai":  # needs AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT env vars
            from langchain_openai import AzureChatOpenAI

            return AzureChatOpenAI(
                azure_deployment=s.llm_model, api_version=s.azure_api_version,
                max_tokens=s.llm_max_tokens, timeout=s.llm_timeout_s, max_retries=2, **temp,
            )
        case "anthropic":
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(
                model=s.llm_model, max_tokens=s.llm_max_tokens,
                timeout=s.llm_timeout_s, max_retries=2, **temp,
            )
        case "bedrock":  # on AWS, use the instance/task IAM role, no keys in .env
            from langchain_aws import ChatBedrockConverse

            return ChatBedrockConverse(
                model=s.llm_model, region_name=s.aws_region,
                max_tokens=s.llm_max_tokens, **temp,
            )
        case "ollama":
            from langchain_ollama import ChatOllama

            return ChatOllama(model=s.llm_model, base_url=s.ollama_base_url, **temp)
        case _:
            raise RuntimeError(f"Unknown LLM_PROVIDER: {s.llm_provider}")
