#!/usr/bin/env python3
"""
Setup script for Langfuse prompt management
Run this once to initialize all prompts in your Langfuse project
"""

import os
import sys

# Load environment variables
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Add agents to path
sys.path.append(os.path.join(os.path.dirname(__file__), 'agents'))

from langfuse_integration import setup_langfuse_prompts, prompt_manager

def main():
    print("🚀 Setting up Langfuse prompt management for Invoice Verification Agents")
    print("=" * 70)
    
    # Check environment variables
    public_key = os.getenv('LANGFUSE_PUBLIC_KEY', '')
    secret_key = os.getenv('LANGFUSE_SECRET_KEY', '')
    openai_key = os.getenv('OPENAI_API_KEY', '')
    
    print("\n📋 Environment Check:")
    print(f"  LANGFUSE_PUBLIC_KEY: {'✅ Set' if public_key and not public_key.startswith('pk-lf-placeholder') else '❌ Not configured (using placeholder)'}")
    print(f"  LANGFUSE_SECRET_KEY: {'✅ Set' if secret_key and not secret_key.startswith('sk-lf-placeholder') else '❌ Not configured (using placeholder)'}")
    print(f"  OPENAI_API_KEY: {'✅ Set' if openai_key and not openai_key.startswith('sk-proj-placeholder') else '❌ Not configured'}")
    print(f"  LANGFUSE_HOST: {os.getenv('LANGFUSE_HOST', 'https://cloud.langfuse.com')}")
    
    # Show integration status
    print("\n🔧 Integration Status:")
    print(f"  Langfuse client: {'✅ Connected' if prompt_manager.langfuse else '❌ Not connected'}")
    print(f"  OpenAI client: {'✅ Connected' if prompt_manager.openai_client else '❌ Not connected'}")
    
    # Set up prompts if possible
    if prompt_manager.langfuse:
        print("\n📝 Setting up prompts in Langfuse...")
        success = setup_langfuse_prompts()
        if success:
            print("✅ Langfuse prompts created successfully!")
        else:
            print("❌ Failed to create some prompts")
    else:
        print("\n⚠️ Cannot setup prompts - Langfuse not connected")
        print("   Please configure real Langfuse credentials to enable prompt management")
    
    # Test LLM integration if available
    if prompt_manager.openai_client and prompt_manager.langfuse:
        print("\n🧪 Testing end-to-end LLM integration...")
        from validation_agent import ValidationAgentCreator
        
        validator = ValidationAgentCreator()
        test_result = validator.validation_tool._run(
            "Test wrench", 
            "Standard adjustable wrench", 
            "Testing LLM integration"
        )
        print(f"Test result: ✅ Success ({len(test_result)} chars)")
        
    elif prompt_manager.openai_client:
        print("\n🧪 Testing OpenAI integration (without Langfuse)...")
        from langfuse_integration import call_llm
        
        response = call_llm("Say 'LLM integration test successful' and nothing else.")
        if response and "successful" in response.lower():
            print("✅ OpenAI integration working")
        else:
            print("⚠️ OpenAI integration may have issues")
    
    # Summary and next steps
    print("\n" + "=" * 70)
    print("📊 SUMMARY:")
    
    if prompt_manager.langfuse and prompt_manager.openai_client:
        print("🎉 FULL INTEGRATION READY!")
        print("   • All agents can use Langfuse-managed prompts")
        print("   • LLM calls are traced to Langfuse") 
        print("   • Judge evaluations are recorded")
        print("   • Prompt versioning and A/B testing available")
    
    elif prompt_manager.openai_client:
        print("⚠️ PARTIAL INTEGRATION:")
        print("   • LLM calls work but use fallback prompts")
        print("   • No tracing or prompt management")
        print("   • Set up real Langfuse credentials for full functionality")
    
    else:
        print("❌ LIMITED FUNCTIONALITY:")
        print("   • Only rule-based validation available")  
        print("   • No LLM integration")
        print("   • Configure OpenAI and Langfuse credentials")
    
    print("\n🔑 TO ENABLE FULL INTEGRATION:")
    print("1. Sign up for Langfuse at https://langfuse.com")
    print("2. Create a new project and get your API keys")
    print("3. Update .env with real credentials:")
    print("   LANGFUSE_PUBLIC_KEY=pk-lf-...")
    print("   LANGFUSE_SECRET_KEY=sk-lf-...")
    print("   OPENAI_API_KEY=sk-...")
    print("4. Re-run this script to initialize prompts")
    
    print("\n💡 AGENT ARCHITECTURE:")
    print("   • Core Invoice Agents: Item Matcher, Price Learner, Rule Applier")
    print("   • Validation Agent: User abuse detection with LLM")
    print("   • All agents now use Langfuse-managed prompts")
    print("   • Judge LLM sections will appear in Langfuse once credentials are set")

if __name__ == "__main__":
    main()