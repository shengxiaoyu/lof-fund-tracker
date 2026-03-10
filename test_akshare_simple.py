#!/usr/bin/env python3
"""
简单测试AkShare获取LOF数据
"""

import akshare as ak
import pandas as pd
from datetime import datetime

def test_fund_em_info():
    """测试东方财富基金信息"""
    print("测试东方财富基金信息接口...")
    try:
        # 获取基金基本信息
        fund_info = ak.fund_em_open_fund_info(fund="162411")
        if not fund_info.empty:
            print("✅ 成功获取基金信息")
            print(f"数据形状: {fund_info.shape}")
            print(f"最新数据:\n{fund_info.tail(3)}")
            return True
    except Exception as e:
        print(f"❌ 失败: {e}")
    return False

def test_fund_etf_hist():
    """测试ETF历史数据"""
    print("\n测试ETF历史数据接口...")
    try:
        # sz162411 表示深交所的162411
        hist_data = ak.fund_etf_hist_sina(symbol="sz162411")
        if not hist_data.empty:
            print("✅ 成功获取ETF历史数据")
            print(f"数据形状: {hist_data.shape}")
            print(f"最新数据:\n{hist_data.tail(1)}")
            return True
    except Exception as e:
        print(f"❌ 失败: {e}")
    return False

def test_stock_spot():
    """测试股票实时行情"""
    print("\n测试股票实时行情接口...")
    try:
        # 获取A股实时行情
        spot_data = ak.stock_zh_a_spot_em()
        if not spot_data.empty:
            print("✅ 成功获取股票实时行情")
            print(f"数据形状: {spot_data.shape}")
            
            # 查找162411
            fund_data = spot_data[spot_data['代码'] == '162411']
            if not fund_data.empty:
                print("✅ 找到162411实时行情:")
                print(fund_data)
                return True
            else:
                print("⚠️  162411未在实时行情中找到")
    except Exception as e:
        print(f"❌ 失败: {e}")
    return False

def test_fund_value():
    """测试基金净值"""
    print("\n测试基金净值接口...")
    try:
        # 获取基金净值
        fund_value = ak.fund_open_fund_info_em(fund="162411", indicator="单位净值走势")
        if not fund_value.empty:
            print("✅ 成功获取基金净值")
            print(f"最新净值:\n{fund_value.tail(1)}")
            return True
    except Exception as e:
        print(f"❌ 失败: {e}")
    return False

def main():
    print(f"测试开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"AkShare版本: {ak.__version__}")
    print("=" * 60)
    
    results = {
        "基金信息": test_fund_em_info(),
        "ETF历史": test_fund_etf_hist(),
        "实时行情": test_stock_spot(),
        "基金净值": test_fund_value()
    }
    
    print("\n" + "=" * 60)
    print("测试结果汇总:")
    for name, success in results.items():
        status = "✅ 成功" if success else "❌ 失败"
        print(f"{name}: {status}")
    
    success_count = sum(results.values())
    total_count = len(results)
    print(f"\n成功率: {success_count}/{total_count} ({success_count/total_count*100:.1f}%)")

if __name__ == "__main__":
    main()