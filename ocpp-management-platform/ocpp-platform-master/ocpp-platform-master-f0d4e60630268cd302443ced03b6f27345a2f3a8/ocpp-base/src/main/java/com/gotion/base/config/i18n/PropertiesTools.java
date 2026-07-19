package com.gotion.base.config.i18n;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.MessageSource;
import org.springframework.context.NoSuchMessageException;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * @Classname PropertiesTools
 * @Description TODO
 * @Version 1.0.0
 * @Date 2024-11-15
 * @Created zhuangzhuang
 */
@Slf4j
@Component
public class PropertiesTools {

    @Autowired
    private MessageSource messageSource;

    public String getProperties(String name) {
        try {
            Locale locale = LocaleContextHolder.getLocale();
            return messageSource.getMessage(name, null, locale);
        } catch (NoSuchMessageException e) {
            log.error("获取配置异常!异常信息:{}", e);
        }
        return null;
    }

}
