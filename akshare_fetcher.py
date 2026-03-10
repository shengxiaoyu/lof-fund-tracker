#!/usr/bin/env python3
"""
AkShare数据获取模块
用于获取LOF基金数据
"""

import akshare as ak
import pandas as pd
import json
import time
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AkshareLOFFetcher:
    """AkShare LOF基金数据获取器"""
    
    def __init__(self, timeout=10):
        self.timeout = timeout
        self.cache = {}
        
    def get_fund_data(self, fund_code):
        """获取基金完整数据"""
        logger.info(f"开始获取基金数据: {fund_code}")
        
        result = {
            "code": fund_code,
            "name": "",
            "net_value": "",  # 场外净值
            "market_price": "",  # 场内价格
            "premium_rate": "",  # 折溢价率
            "fund_type": "",
            "subscription_status": "",
            "purchase_limit": "",
            "source": "akshare",
            "update_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "errors": []
        }
        
        try:
            # 1. 获取场外净值（从东方财富）
            net_value_data = self._get_net_value(fund_code)
            if net_value_data:
                result.update(net_value_data)
            
            # 2. 获取场内价格（从新浪历史数据）
            market_price_data = self._get_market_price(fund_code)
            if market_price_data:
                result.update(market_price_data)
            
            # 3. 计算折溢价率
            if result["net_value"] and result["market_price"]:
                try:
                    net_val = float(result["net_value"].split('-')[0])
                    market_val = float(result["market_price"])
                    if net_val > 0:
                        premium = ((market_val - net_val) / net_val * 100)
                        result["premium_rate"] = f"{premium:.2f}%"
                except:
                    result["premium_rate"] = "--"
            
            # 4. 获取基金基本信息
            fund_info = self._get_fund_info(fund_code)
            if fund_info:
                result.update(fund_info)
            
            logger.info(f"基金数据获取成功: {fund_code}")
            return result
            
        except Exception as e:
            error_msg = f"获取基金数据失败: {str(e)}"
            logger.error(error_msg)
            result["errors"].append(error_msg)
            return result
    
    def _get_net_value(self, fund_code):
        """获取场外净值"""
        try:
            # 使用东方财富开放式基金接口
            fund_data = ak.fund_open_fund_info_em(
                fund=fund_code, 
                indicator="单位净值走势"
            )
            
            if not fund_data.empty:
                latest = fund_data.iloc[-1]
                net_value = latest.get('单位净值', '')
                change = latest.get('日增长率', '')
                
                return {
                    "net_value": f"{net_value}{change}",
                    "name": latest.get('基金简称', f"基金{fund_code}")
                }
        except Exception as e:
            logger.warning(f"场外净值获取失败: {e}")
        
        return None
    
    def _get_market_price(self, fund_code):
        """获取场内价格"""
        try:
            # 确定交易所代码
            exchange_code = self._get_exchange_code(fund_code)
            
            # 获取历史数据，取最新值作为场内价格
            hist_data = ak.fund_etf_hist_sina(symbol=exchange_code)
            
            if not hist_data.empty:
                latest = hist_data.iloc[-1]
                market_price = latest.get('close', '')
                
                return {
                    "market_price": str(market_price),
                    "market_price_source": "sina_hist"
                }
        except Exception as e:
            logger.warning(f"场内价格获取失败: {e}")
            
            # 备用方案：使用股票实时行情
            try:
                stock_data = ak.stock_zh_a_spot_em()
                if not stock_data.empty:
                    fund_stock = stock_data[stock_data['代码'] == fund_code]
                    if not fund_stock.empty:
                        price = fund_stock.iloc[0]['最新价']
                        return {
                            "market_price": str(price),
                            "market_price_source": "stock_spot"
                        }
            except Exception as e2:
                logger.warning(f"股票实时行情也失败: {e2}")
        
        return None
    
    def _get_fund_info(self, fund_code):
        """获取基金基本信息"""
        try:
            # 尝试获取基金档案
            fund_profile = ak.fund_fhpx_detail_em(symbol=fund_code)
            
            if not fund_profile.empty:
                info = {
                    "fund_type": fund_profile.iloc[0].get('基金类型', ''),
                    "subscription_status": "开放申购",  # 默认
                    "purchase_limit": "无限制"  # 默认
                }
                
                # 解析限购信息（如果有）
                profile_text = str(fund_profile)
                if "限大额" in profile_text:
                    info["subscription_status"] = "限大额申购"
                    # 尝试提取限购金额
                    import re
                    limit_match = re.search(r'(\d+\.?\d*)\s*元', profile_text)
                    if limit_match:
                        info["purchase_limit"] = f"{limit_match.group(1)}元/天"
                
                return info
        except Exception as e:
            logger.warning(f"基金信息获取失败: {e}")
        
        return None
    
    def _get_exchange_code(self, fund_code):
        """获取交易所代码"""
        # LOF基金代码规则：
        # 15/16开头 -> 深交所 (sz)
        # 50/51开头 -> 上交所 (sh)
        if fund_code.startswith(('15', '16')):
            return f"sz{fund_code}"
        elif fund_code.startswith(('50', '51')):
            return f"sh{fund_code}"
        else:
            # 默认深交所
            return f"sz{fund_code}"
    
    def search_funds(self, keyword):
        """搜索基金"""
        try:
            # 使用东方财富基金搜索
            search_result = ak.fund_em_fund_name()
            
            if not search_result.empty:
                # 筛选包含关键词的基金
                matched = search_result[
                    search_result['基金代码'].astype(str).str.contains(keyword) |
                    search_result['基金简称'].str.contains(keyword)
                ]
                
                funds = []
                for _, row in matched.head(10).iterrows():
                    funds.append({
                        "code": row['基金代码'],
                        "name": row['基金简称'],
                        "type": row.get('基金类型', '')
                    })
                
                return funds
        except Exception as e:
            logger.error(f"基金搜索失败: {e}")
        
        return []


def test_fetcher():
    """测试数据获取器"""
    fetcher = AkshareLOFFetcher()
    
    # 测试162411
    print("测试华宝油气(162411)...")
    data = fetcher.get_fund_data("162411")
    
    print("\n获取结果:")
    print(json.dumps(data, ensure_ascii=False, indent=2))
    
    # 测试搜索
    print("\n测试搜索'油气'...")
    search_results = fetcher.search_funds("油气")
    print(f"找到 {len(search_results)} 个基金")
    for fund in search_results[:3]:
        print(f"  {fund['code']} - {fund['name']}")


if __name__ == "__main__":
    print(f"AkShare数据获取器测试 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    test_fetcher()