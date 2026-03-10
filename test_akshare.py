#!/usr/bin/env python3
"""
测试AkShare获取LOF基金数据
"""

import akshare as ak
import pandas as pd
import json
from datetime import datetime

def test_akshare_fund_data():
    """测试AkShare获取基金数据"""
    print("=" * 60)
    print("AkShare LOF基金数据测试")
    print("=" * 60)
    
    fund_code = "162411"  # 华宝油气
    
    try:
        # 1. 尝试获取ETF/LOF实时行情
        print("\n1. 尝试获取ETF/LOF实时行情...")
        try:
            etf_spot = ak.fund_etf_spot_em()
            if not etf_spot.empty:
                # 查找特定基金
                fund_data = etf_spot[etf_spot['代码'] == fund_code]
                if not fund_data.empty:
                    print("✅ ETF实时行情获取成功:")
                    print(fund_data.to_string())
                else:
                    print("⚠️  基金未在ETF实时行情中找到")
            else:
                print("❌ ETF实时行情数据为空")
        except Exception as e:
            print(f"❌ ETF实时行情接口失败: {e}")
        
        # 2. 尝试获取基金历史数据
        print("\n2. 尝试获取基金历史数据...")
        try:
            # 获取最近一天的数据
            fund_hist = ak.fund_etf_hist_sina(symbol=f"sz{fund_code}")
            if not fund_hist.empty:
                print("✅ 基金历史数据获取成功:")
                print(f"最新数据:\n{fund_hist.tail(1).to_string()}")
            else:
                print("❌ 基金历史数据为空")
        except Exception as e:
            print(f"❌ 基金历史数据接口失败: {e}")
        
        # 3. 尝试获取基金基本信息
        print("\n3. 尝试获取基金基本信息...")
        try:
            # 注意：AkShare接口可能更新，需要查看最新文档
            fund_info = ak.fund_etf_fund_info_em(symbol=fund_code)
            if not fund_info.empty:
                print("✅ 基金基本信息获取成功:")
                print(fund_info.to_string())
            else:
                print("❌ 基金基本信息为空")
        except Exception as e:
            print(f"❌ 基金基本信息接口失败: {e}")
        
        # 4. 尝试其他接口
        print("\n4. 尝试其他数据接口...")
        
        # 4.1 开放式基金
        try:
            open_fund = ak.fund_open_fund_info_em(fund=fund_code, indicator="单位净值走势")
            if not open_fund.empty:
                print("✅ 开放式基金数据获取成功")
                print(f"最新净值: {open_fund.tail(1).to_string()}")
        except Exception as e:
            print(f"❌ 开放式基金接口失败: {e}")
        
        # 4.2 基金档案
        try:
            fund_profile = ak.fund_fhpx_detail_em(symbol=fund_code)
            if not fund_profile.empty:
                print("✅ 基金档案获取成功")
                print(fund_profile.head().to_string())
        except Exception as e:
            print(f"❌ 基金档案接口失败: {e}")
        
        # 5. 股票实时行情（LOF场内交易）
        print("\n5. 尝试获取股票实时行情...")
        try:
            # LOF在深交所的代码是sz162411
            stock_spot = ak.stock_zh_a_spot_em()
            if not stock_spot.empty:
                fund_stock = stock_spot[stock_spot['代码'] == fund_code]
                if not fund_stock.empty:
                    print("✅ 股票实时行情获取成功:")
                    print(fund_stock.to_string())
                else:
                    print("⚠️  基金未在股票实时行情中找到")
            else:
                print("❌ 股票实时行情数据为空")
        except Exception as e:
            print(f"❌ 股票实时行情接口失败: {e}")
        
        print("\n" + "=" * 60)
        print("测试完成")
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ 测试过程中出现错误: {e}")
        import traceback
        traceback.print_exc()

def test_simple_methods():
    """测试简单方法"""
    print("\n" + "=" * 60)
    print("测试简单数据获取方法")
    print("=" * 60)
    
    fund_code = "162411"
    
    # 方法1：直接使用东方财富接口
    print("\n方法1：东方财富基金页面")
    try:
        fund_em = ak.fund_em_open_fund_info(fund=fund_code)
        if not fund_em.empty:
            print("✅ 东方财富基金数据:")
            print(fund_em.head())
    except Exception as e:
        print(f"❌ 失败: {e}")
    
    # 方法2：新浪财经
    print("\n方法2：新浪财经")
    try:
        fund_sina = ak.fund_etf_hist_sina(symbol=f"sz{fund_code}")
        if not fund_sina.empty:
            print("✅ 新浪财经数据:")
            print(fund_sina.tail(1))
    except Exception as e:
        print(f"❌ 失败: {e}")
    
    # 方法3：腾讯财经
    print("\n方法3：腾讯财经")
    try:
        # 腾讯财经的实时行情
        stock_qq = ak.stock_zh_a_spot()
        if not stock_qq.empty:
            fund_qq = stock_qq[stock_qq['symbol'] == f"{fund_code}.SZ"]
            if not fund_qq.empty:
                print("✅ 腾讯财经数据:")
                print(fund_qq)
            else:
                print("⚠️  未找到基金数据")
    except Exception as e:
        print(f"❌ 失败: {e}")

if __name__ == "__main__":
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"AkShare版本: {ak.__version__}")
    
    # 运行测试
    test_akshare_fund_data()
    
    # 测试简单方法
    test_simple_methods()